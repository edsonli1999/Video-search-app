# Update all branches to match beetle branch
Write-Host "Updating all branches to match beetle..." -ForegroundColor Cyan

# First, ensure we're on beetle and it's up to date
Write-Host "Ensuring beetle branch is current..." -ForegroundColor Green
git checkout raven-beetle
git pull origin raven-beetle

# Update main to match beetle
Write-Host "Updating main to match beetle..." -ForegroundColor Yellow
git checkout main
git reset --hard raven-beetle
git push --force origin main

# Update all other branches to match beetle
$branches = @('sonnet', 'raven-ocelot')
foreach ($branch in $branches) {
    Write-Host "Updating branch: $branch to match beetle" -ForegroundColor Green
    git checkout $branch
    git reset --hard raven-beetle
    git push --force origin $branch
    Write-Host "Completed: $branch" -ForegroundColor Yellow
}

Write-Host "All branches now match beetle!" -ForegroundColor Cyan