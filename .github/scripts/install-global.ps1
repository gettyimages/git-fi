# Install the packed tarball globally, the way a user of that package manager
# would, and export ENTRY: the path that package manager's launcher hands node.
# The INSTALL-01 steps reach the copy by that path rather than through `git fi`,
# which is the only way a shadowed copy gets to say anything at all.
#
# The two lay a global install out differently. npm puts the package under its
# prefix. pnpm puts it in a node_modules of its own global directory: directly
# under `pnpm root -g` up to pnpm 10, and in a per-package subdirectory of it
# from pnpm 11.
param(
  [Parameter(Mandatory)]
  [ValidateSet('npm', 'pnpm')]
  [string]$Installer
)

$ErrorActionPreference = 'Continue'
$tgz = (Get-ChildItem gettyimages-git-fi-*.tgz).FullName
$package = 'node_modules\@gettyimages\git-fi\dist\index.js'

if ($Installer -eq 'pnpm') {
  # pnpm refuses a global install until it has a global bin directory on PATH,
  # which `pnpm setup` arranges on a user's machine. Do the same here, for this
  # step and the ones after it.
  if (-not $env:PNPM_HOME) {
    $env:PNPM_HOME = Join-Path $env:RUNNER_TEMP 'pnpm-home'
    "PNPM_HOME=$env:PNPM_HOME" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
  }
  $bin = (pnpm bin -g).Trim()
  New-Item -ItemType Directory -Force $bin | Out-Null
  $env:PATH = "$bin;$env:PATH"
  $bin | Out-File -Append -Encoding utf8 $env:GITHUB_PATH

  pnpm add -g $tgz
  if ($LASTEXITCODE) { throw "pnpm add -g failed ($LASTEXITCODE)" }
  $root = (pnpm root -g).Trim()
  $candidates = @(Join-Path $root '@gettyimages\git-fi\dist\index.js')
  $candidates += Get-ChildItem $root -Directory | ForEach-Object { Join-Path $_.FullName $package }
} else {
  npm install -g $tgz
  if ($LASTEXITCODE) { throw "npm install -g failed ($LASTEXITCODE)" }
  $prefix = (npm config get prefix).Trim()
  $candidates = @(Join-Path $prefix $package)
}

$entry = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $entry) { throw "no installed git-fi entry point found for $Installer among: $($candidates -join ', ')" }
"installed with $Installer at $entry"
"ENTRY=$entry" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
