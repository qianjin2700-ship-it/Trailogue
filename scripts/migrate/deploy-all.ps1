# deploy-all.ps1 — 批量部署 12 个云函数到新环境
# 用法：PowerShell 中执行  .\scripts\migrate\deploy-all.ps1
#
# ⚠️ 已知风险：cli.bat 内部会调 reg.exe，可能被安全软件拦截。
#    若报 Program Blacklist / reg.exe 相关错误，改用开发者工具手动部署：
#    cloudfunctions/<函数名> 右键 →「上传并部署：云端安装依赖」

$cli     = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
$project = "c:\Users\qjz19\WorkBuddy\20260823204843\lvji-chengshu"
$envId   = "yaomiao-d3g3u7ckz71fffd26"

$functions = @(
  'album', 'auth', 'export',
  'internal-cleanup', 'internal-generateStory', 'internal-init',
  'internal-processMeta', 'internal-processVision',
  'photo', 'privacy', 'share', 'story'
)

foreach ($fn in $functions) {
  Write-Output "===== $fn  (1st attempt) ====="
  & $cli cloud functions deploy --e $envId --n $fn --project $project --r
  Start-Sleep -Seconds 3
  Write-Output "===== $fn  (2nd attempt, 首次必失败) ====="
  & $cli cloud functions deploy --e $envId --n $fn --project $project --r
  Start-Sleep -Seconds 5
}

Write-Output "===== ALL DONE ====="
Write-Output "下一步：控制台 → 云函数 → internal-init → 云端测试 → 调用一次（创建 11 个集合）"
