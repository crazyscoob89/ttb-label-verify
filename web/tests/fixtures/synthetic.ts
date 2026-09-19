import sharp from 'sharp';
import { crc32 } from 'node:zlib';

export const application = {
  applicationId: 'SYNTH-001', applicationVersion: 'v1', brand: 'Sample Brand',
  classType: 'Vodka', abv: '40.0', netContents: '750 mL',
  producerName: 'Synthetic Producer', producerAddress: '1 Example Street, Example City',
  commodity: 'distilled-spirits', imported: false,
  origin: { kind: 'domestic', country: 'United States' },
};

export function image(format: 'png' | 'jpeg' = 'png', width = 4, height = 3) {
  return sharp({ create: { width, height, channels: 3, background: '#173a5e' } })[format]().toBuffer();
}

// Two-frame APNG with valid lengths, sequence numbers and CRCs; both frames
// reuse the tiny generated PNG pixels. No fixture files or external assets.
export function animationControl(png: Buffer) {
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
    return out;
  };
  const control = Buffer.alloc(8); control.writeUInt32BE(2);
  const frame = (sequence: number) => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence); data.writeUInt32BE(png.readUInt32BE(16), 4);
    data.writeUInt32BE(png.readUInt32BE(20), 8);
    data.writeUInt16BE(1, 20); data.writeUInt16BE(10, 22);
    return chunk('fcTL', data);
  };
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const pixels = Buffer.concat(data);
  const sequence = Buffer.alloc(4); sequence.writeUInt32BE(2);
  return Buffer.concat([png.subarray(0, 33), chunk('acTL', control), frame(0), chunk('IDAT', pixels), frame(1), chunk('fdAT', Buffer.concat([sequence, pixels])), chunk('IEND', Buffer.alloc(0))]);
}
