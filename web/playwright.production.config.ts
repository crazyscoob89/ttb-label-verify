import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Start an owned production build/server separately, with TTB_OFFLINE_DEMO=1.
// Even that opt-in must not enable fixture processing in production.
export default defineConfig({ ...base, testDir: './tests/production' });
