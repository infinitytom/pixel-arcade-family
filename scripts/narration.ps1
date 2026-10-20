# Optional local Chinese system-voice narration for the real screen recording.
Add-Type -AssemblyName System.Speech
$arcadeVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$arcadeVoice.SelectVoice('Microsoft Huihui Desktop')
$arcadeVoice.Rate = 2
$arcadeVoice.Volume = 90
$arcadeLines = [ordered]@{
    intro = '把街机厅，搬进你的飞牛。'
    library = '这是像素放映厅家庭版。中文游戏库，封面预览，打开浏览器就能玩。'
    search = '按名称搜索，选好核心，准备开始。'
    gameplay = '游戏在浏览器运行。NAS 只负责提供文件。'
    deploy = '一个容器独立部署，无需账号。'
    support = '项目免费使用，欢迎点星，或自愿支持后续维护。'
}
New-Item -ItemType Directory -Force dist/voice | Out-Null
foreach ($arcadeScene in $arcadeLines.Keys) {
    $arcadeWav = Join-Path (Get-Location) "dist/voice/$arcadeScene.wav"
    $arcadeVoice.SetOutputToWaveFile($arcadeWav)
    $arcadeVoice.Speak($arcadeLines[$arcadeScene])
    $arcadeVoice.SetOutputToNull()
}
$arcadeVoice.Dispose()
