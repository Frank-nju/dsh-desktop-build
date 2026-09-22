# Install Visual Studio 2022 Build Tools with the VCTools workload.
# Required by apps/desktop/scripts/prepare-windows-installer.ps1 (vswhere + Microsoft.VisualStudio.Component.VC.Tools.x86.x64)
# and by node-gyp native module builds.
$ErrorActionPreference = 'Continue'
$exe = 'E:\gcc\dsh-build\tools\vs_BuildTools.exe'
$log = 'E:\gcc\dsh-build\tools\vs-install.log'

"=== [$(Get-Date -Format o)] starting VS Build Tools install ===" | Set-Content -Path $log -Encoding utf8

# Microsoft.VisualStudio.Workload.VCTools --includeRecommended provides
# Microsoft.VisualStudio.Component.VC.Tools.x86.x64 (the component vswhere -requires checks)
# plus the MSVC toolset and a Windows SDK. VC.ATLMFC is added explicitly because
# apps/desktop/installer/window-frame.cpp uses GDI+ / ATL headers.
$components = @(
  '--add', 'Microsoft.VisualStudio.Workload.VCTools',
  '--includeRecommended',
  '--add', 'Microsoft.VisualStudio.Component.VC.ATLMFC'
)

$argList = @(
  '--quiet', '--wait', '--norestart', '--nocache'
) + $components

"args: $($argList -join ' ')" | Add-Content -Path $log -Encoding utf8

$p = Start-Process -FilePath $exe -ArgumentList $argList -Verb RunAs -PassThru -Wait
$code = $p.ExitCode
"exit code: $code" | Add-Content -Path $log -Encoding utf8

# Report installer result for the parent to read.
$done = [ordered]@{
  exitCode  = $code
  finishedAt = (Get-Date -Format o)
}
$done | ConvertTo-Json | Set-Content -Path 'E:\gcc\dsh-build\tools\vs-install-result.json' -Encoding utf8
"=== done ===" | Add-Content -Path $log -Encoding utf8
