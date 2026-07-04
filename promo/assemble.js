/* Encodes frames + mixes audio into couch-controller-promo.mp4 */
const { execFileSync } = require('child_process');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

const vo = [   // [file, start seconds]
  ['vo/vo1.wav', 0.50],
  ['vo/vo2.wav', 7.30],
  ['vo/vo3.wav', 14.20],
  ['vo/vo4.wav', 21.20],
  ['vo/vo5.wav', 27.50],
  ['vo/vo6.wav', 34.50],
  ['vo/vo7.wav', 41.90],
  ['vo/vo8.wav', 47.90],
];

const args = ['-y', '-framerate', '30', '-i', 'frames/f%05d.jpg', '-i', 'sfxmusic.wav'];
for (const [f] of vo) args.push('-i', f);

let fc = '[1:a]anull[m];';
const mixIns = ['[m]'];
vo.forEach(([f, at], i) => {
  const ms = Math.round(at * 1000);
  fc += `[${i + 2}:a]adelay=${ms}|${ms},volume=1.0[v${i}];`;
  mixIns.push(`[v${i}]`);
});
fc += `${mixIns.join('')}amix=inputs=${mixIns.length}:duration=first:normalize=0,alimiter=limit=0.95,aformat=sample_rates=44100:channel_layouts=stereo[aout]`;

args.push(
  '-filter_complex', fc,
  '-map', '0:v', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k',
  '-shortest', '-movflags', '+faststart',
  'couch-controller-promo.mp4'
);

execFileSync(ffmpeg, args, { cwd: __dirname, stdio: 'inherit' });
console.log('done');
