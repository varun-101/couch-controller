Add-Type -AssemblyName System.Speech
$out = Join-Path $PSScriptRoot "vo"
New-Item -ItemType Directory -Force $out | Out-Null

$lines = @(
  "Meet Couch Controller. The extension that turns your gamepad into a remote, for the web.",
  "Press A, to play, or pause, any video.",
  "Tap the D-pad, to take the volume up, or down.",
  "Pull the triggers, to skip back, or ahead.",
  "Flip through tabs with the bumpers. Just like changing channels.",
  "Scroll with the left stick. Point and click, with the right.",
  "And every button can be remapped. Combos, custom keys, and more.",
  "Couch Controller. Sit back, and browse."
)

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("Microsoft Zira Desktop")
$s.Rate = 1

for ($i = 0; $i -lt $lines.Count; $i++) {
  $f = Join-Path $out ("vo{0}.wav" -f ($i + 1))
  $s.SetOutputToWaveFile($f, (New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)))
  $s.Speak($lines[$i])
  $s.SetOutputToNull()
}
$s.Dispose()

# report durations
foreach ($f in Get-ChildItem $out -Filter *.wav | Sort-Object Name) {
  $bytes = $f.Length - 44
  $sec = [math]::Round($bytes / (44100 * 2), 2)
  Write-Output ("{0}  {1}s" -f $f.Name, $sec)
}
