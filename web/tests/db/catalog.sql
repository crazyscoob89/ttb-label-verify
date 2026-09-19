-- Read-only actual PostgreSQL catalog preflight. NOT a behavioral security suite.
-- No migration, fixture creation, role mutation or service activation here.
SELECT CASE WHEN
  current_database() ~ '^ttb_phase4_test_[a-z0-9_]+$'
  AND current_setting('default_transaction_read_only') = 'on'
  AND (SELECT count(*) = 8 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND r.rolname = 'ttb_owner')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_roles r ON r.oid = c.relowner
       WHERE n.nspname = 'ttb_private' AND c.relkind = 'r')
  AND (SELECT count(*) = 7 AND bool_and(p.prosecdef AND 'search_path=pg_catalog' = ANY(p.proconfig))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ttb_api')
  AND NOT has_schema_privilege('authenticated', 'ttb_private', 'USAGE')
  AND NOT pg_has_role('authenticated', 'ttb_owner', 'MEMBER')
  AND NOT pg_has_role('authenticated', 'ttb_purge', 'MEMBER')
  AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('ttb_owner','ttb_purge') AND (rolcanlogin OR rolsuper OR rolbypassrls))
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('authenticated'), ('anon'), ('service_role')) AS runtime(name)
    WHERE n.nspname = 'ttb_private' AND c.relkind = 'r'
      AND (has_table_privilege(runtime.name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_any_column_privilege(runtime.name, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f',p.proowner))) a
    WHERE n.nspname IN ('ttb_api','ttb_private') AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  )
THEN 'TTB_DB_CATALOG_ONLY_PASS' ELSE 'TTB_DB_CATALOG_FAIL' END;
