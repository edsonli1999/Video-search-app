# Update all branches to match sonnet branch
Write-Host "Updating all branches to match sonnet..." -ForegroundColor Cyan

# First, ensure we're on sonnet and it's up to date
Write-Host "Ensuring sonnet branch is current..." -ForegroundColor Green
git checkout sonnet
git pull origin sonnet

# Update main to match sonnet
Write-Host "Updating main to match sonnet..." -ForegroundColor Yellow
git checkout main
git reset --hard sonnet
git push --force origin main

# Update all other branches to match sonnet
$branches = @('raven-beetle', 'raven-ocelot')
foreach ($branch in $branches) {
    Write-Host "Updating branch: $branch to match sonnet" -ForegroundColor Green
    git checkout $branch
    git reset --hard sonnet
    git push --force origin $branch
    Write-Host "Completed: $branch" -ForegroundColor Yellow
}

Write-Host "All branches now match sonnet!" -ForegroundColor Cyan