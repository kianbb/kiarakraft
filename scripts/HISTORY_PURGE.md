# Git History Purge Instructions

## ⚠️ WARNING - DESTRUCTIVE OPERATION
**This will permanently rewrite git history. Make a backup first!**

## Prerequisites
1. Install `git-filter-repo`:
   ```bash
   # macOS with Homebrew
   brew install git-filter-repo
   
   # Or with pip
   pip install git-filter-repo
   ```

2. **Create a backup** of your repository:
   ```bash
   git clone --mirror https://github.com/kianbb/kiarakraft.git kiarakraft-backup
   ```

## Purge Commands

Run these commands in order from your local repository:

```bash
# 1. Ensure you have the latest changes
git fetch origin main
git checkout main
git reset --hard origin/main

# 2. Remove sensitive files from entire git history
git filter-repo --path .env --invert-paths
git filter-repo --path .env.production --invert-paths  
git filter-repo --path dev.log --invert-paths
git filter-repo --path full_output.log --invert-paths
git filter-repo --path temp.txt --invert-paths

# 3. Force push rewritten history (DESTRUCTIVE!)
git remote add origin https://github.com/kianbb/kiarakraft.git
git push --force --all
git push --force --tags

# 4. Verify the files are gone from history
git log --all --full-history -- .env
git log --all --full-history -- .env.production  
git log --all --full-history -- dev.log
git log --all --full-history -- full_output.log
git log --all --full-history -- temp.txt
```

## Alternative: Single command approach
```bash
# All at once (preferred method)
git filter-repo --path .env --path .env.production --path dev.log --path full_output.log --path temp.txt --invert-paths

git remote add origin https://github.com/kianbb/kiarakraft.git  
git push --force --all
git push --force --tags
```

## Post-Purge Actions Required

### 1. Team Synchronization
All team members must re-clone the repository:
```bash
# Each team member runs:
cd .. 
rm -rf kiarakraft
git clone https://github.com/kianbb/kiarakraft.git
cd kiarakraft
```

### 2. ⚠️ **CRITICAL: Rotate All Secrets**

Since these files contained secrets, **immediately rotate**:

#### Neon Database
- Generate new `DATABASE_URL` and `DIRECT_URL` 
- Update in Vercel environment variables

#### NextAuth.js  
- Generate new `NEXTAUTH_SECRET`:
  ```bash
  openssl rand -base64 32
  ```
- Update in Vercel environment variables

#### Vercel Deployment
1. Go to https://vercel.com/kianbb/kiarakraft/settings/environment-variables
2. Update these environment variables:
   - `DATABASE_URL` (new Neon pooled connection)  
   - `DIRECT_URL` (new Neon direct connection)
   - `NEXTAUTH_SECRET` (newly generated)
3. Redeploy: `vercel --prod`

#### GitHub Repository Secrets
Update these in https://github.com/kianbb/kiarakraft/settings/secrets/actions:
- `DATABASE_URL` → new Neon pooled URL
- `DIRECT_URL` → new Neon direct URL

## Verification
1. Check repository size decreased significantly  
2. Confirm secrets no longer appear in git history
3. Verify production deployment still works with new secrets
4. Run full application test

## Recovery
If something goes wrong:
```bash  
# Restore from backup
cd ../kiarakraft-backup
git clone --mirror . ../kiarakraft-recovered
cd ../kiarakraft-recovered  
git remote set-url origin https://github.com/kianbb/kiarakraft.git
git push --force --all
git push --force --tags
```

---
**Created:** August 15, 2025
**Repository:** kiarakraft  
**Sensitive files:** .env, .env.production, dev.log, full_output.log, temp.txt

## Status Update (August 15, 2025)

✅ **Files removed from working directory**: All sensitive files have been deleted from the current working directory
✅ **Gitignore updated**: .gitignore already contains entries to prevent future commits of these files  
⚠️ **History purge pending**: The above commands need to be executed to remove files from Git history
⚠️ **Secret rotation pending**: After history purge, all secrets need to be rotated