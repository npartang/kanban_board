Param(
  [string]$ImageName = "pm-app",
  [string]$ContainerName = "pm-app"
)

Write-Host "Building Docker image '$ImageName'..."
docker build -t $ImageName .

Write-Host "Stopping existing container (if any)..."
$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
if ($existing) {
  docker stop $ContainerName | Out-Null
  docker rm $ContainerName | Out-Null
}

Write-Host "Starting container '$ContainerName' on port 8000..."

$envArgs = @()
if (Test-Path ".env") {
  Write-Host "Using environment from .env"
  $envArgs += "--env-file"
  $envArgs += ".env"
}

docker run -d --name $ContainerName -p 8000:8000 @envArgs $ImageName | Out-Null

Write-Host "App is now running at http://localhost:8000"

