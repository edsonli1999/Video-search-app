# Update local main first
Write-Host "Updating local main..." -ForegroundColor Cyan
git checkout main
git pull origin main

# Then update all other branches
$branches = @('raven-beetle', 'raven-ocelot', 'sonnet')
foreach ($branch in $branches) {
    Write-Host "Updating branch: $branch" -ForegroundColor Green
    git checkout $branch
    git reset --hard main
    git push --force origin $branch
    Write-Host "Completed: $branch" -ForegroundColor Yellow
}