# deploy-yaomiao.ps1 — 批量部署云函数到新环境 yaomiao-d3g3u7ckz71fffd26
# 用法：PowerShell 中执行  .\scripts\migrate\deploy-yaomiao.ps1
# ⚠️ cli.bat 会触发安全软件拦截（reg.exe / wsl.exe），需 dangerouslyDisableSandbox 或手动部署

$cli     = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
$project = "c:\Users\qjz19\WorkBuddy\20260823204843\lvji-chengshu"
$envId   = "yaomiao-d3g3u7ckz71fffd26"
$logDir  = "c:\Users\qjz19\WorkBuddy\20260823204843\lvji-chengshu\.workbuddy\tmp\deploy-yaomiao"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# auth 已单独部署成功，此处跳过
$functions = @(
  'album', 'export',
  'internal-cleanup', 'internal-generateStory', 'internal-init',
  'internal-processMeta', 'internal-processVision',
  'photo', 'privacy', 'share', 'story'
)

foreach ($fn in $functions) {
  Write-Output "===== deploying $fn ====="
  $log = Join-Path $logDir "$fn.log"
  & $cli cloud functions deploy --e $envId --n $fn --project $project --r *> $log
  Start-Sleep -Seconds 6
}

Write-Output "===== ALL DONE ====="
Write-Output "下一步：控制台 → 云函数 → internal-init → 云端测试（创建 11 个集合）"
