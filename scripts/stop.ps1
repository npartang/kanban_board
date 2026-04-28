Param(
  [string]$ContainerName = "pm-app"
)

$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
if (-not $existing) {
  Write-Host "Container '$ContainerName' is not running."
  exit 0
}

Write-Host "Stopping container '$ContainerName'..."
docker stop $ContainerName | Out-Null

Write-Host "Removing container '$ContainerName'..."
docker rm $ContainerName | Out-Null

Write-Host "Container '$ContainerName' has been stopped and removed."

