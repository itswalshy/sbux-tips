# Render Deployment Guide for TipJar

This guide will help you deploy TipJar to Render.

## Prerequisites

- Render account (free tier)
- Render CLI installed and connected
- GitHub repository with your code

## Quick Deployment via Render Dashboard

### Step 1: Connect Your GitHub Repository

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub account if not already connected
4. Select your repository (`sbux.tips`)

### Step 2: Configure Your Service

**Basic Settings:**
- **Name:** `sbux-tips` (or your preferred name)
- **Region:** `Oregon`
- **Branch:** `main` (or your default branch)
- **Root Directory:** Leave empty (or `.`)

**Build & Start:**
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`

**Plan:** 
- Select **Free** (750 hours/month)

### Step 3: Add Environment Variables

Click **Environment** and add:

#### Required Variables:
```
NODE_ENV=production
SESSION_SECRET=<generate a random string>
OCR_ENGINE=auto
```

#### Azure OCR (Optional but Recommended):

**Option 1: Azure Document Intelligence (NEW - Best for tables, 95-98% accuracy)**
```
AZURE_DI_KEY=your_document_intelligence_key_here
AZURE_DI_ENDPOINT=your_document_intelligence_endpoint_here
```

**Option 2: Azure Computer Vision (Legacy - Still works, 88-92% accuracy)**
```
AZURE_CV_KEY=your_computer_vision_key_here
AZURE_CV_ENDPOINT=your_computer_vision_endpoint_here
```

**Note:** Generate a secure SESSION_SECRET (e.g., `openssl rand -hex 32`)

#### How to Get Your Azure Keys:

**Azure Document Intelligence (Recommended):**
1. Go to https://portal.azure.com
2. Create "Document Intelligence" or "Form Recognizer" resource
3. Go to "Keys and Endpoint"
4. Copy KEY 1 and Endpoint

**Azure Computer Vision (Alternative):**
1. Go to https://portal.azure.com
2. Create "Computer Vision" resource
3. Go to "Keys and Endpoint"
4. Copy KEY 1 and Endpoint

**Free Tier:**
- Document Intelligence: 500 free pages/month
- Computer Vision: 5,000 free transactions/month
- Both are FREE and sufficient for testing!

For more details, see `AZURE_DOCUMENT_INTELLIGENCE.md` or `AZURE_OCR_SETUP.md` in your project.

### Step 4: Deploy

1. Click **Create Web Service**
2. Render will automatically build and deploy your app
3. Wait for deployment to complete (~5-10 minutes first time)

Your app will be available at: `https://sbux-tips.onrender.com` (or your custom name)

---

## Deployment via Render CLI

If you prefer using the CLI:

```bash
# Make sure you're in the project directory
cd D:\sbux.tips

# Login to Render (if not already)
render login

# Deploy using the render.yaml configuration
render deploy
```

After deployment, add Azure credentials (if you have them):

```bash
# For Document Intelligence (recommended)
render env set AZURE_DI_KEY=your_key --service sbux-tips
render env set AZURE_DI_ENDPOINT=your_endpoint --service sbux-tips

# OR for Computer Vision (legacy)
render env set AZURE_CV_KEY=your_key --service sbux-tips
render env set AZURE_CV_ENDPOINT=your_endpoint --service sbux-tips
```

---

## Post-Deployment Checklist

- [ ] App loads without errors
- [ ] Can upload Starbucks report images
- [ ] OCR processing works (Azure or Tesseract)
- [ ] Can save tip distributions
- [ ] Can view distribution history

---

## Troubleshooting

### Build Fails
**Problem:** Build command fails
**Solution:** Check logs in Render dashboard. Common issues:
- Missing dependencies in `package.json`
- Build script errors

### Port Already in Use
**Problem:** Port binding error
**Solution:** ✅ This is already fixed - the code now uses `process.env.PORT`

### OCR Not Working
**Problem:** Azure OCR returns errors
**Solution:** 
- Verify `AZURE_CV_KEY` and `AZURE_CV_ENDPOINT` are correct
- App will fall back to Tesseract if Azure fails

### App Spins Down (Free Tier)
**Problem:** App takes 30+ seconds to load
**Solution:** Free tier apps spin down after 15 minutes of inactivity. The first request will be slow (~30 seconds).

---

## Updating Your App

After pushing changes to GitHub:

1. **Automatic Deployment** (if enabled):
   - Render auto-deploys on push to main branch
   - Check dashboard for deployment status

2. **Manual Deployment** (via CLI):
   ```bash
   render deploy
   ```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `production` | Environment mode |
| `SESSION_SECRET` | Yes | - | Session encryption key (auto-generated in render.yaml) |
| `PORT` | No | `5000` | Server port (auto-set by Render) |
| `OCR_ENGINE` | No | `auto` | OCR engine (`auto`, `azure`, `tesseract`) |
| `AZURE_DI_KEY` | Optional | - | Azure Document Intelligence API key (recommended) |
| `AZURE_DI_ENDPOINT` | Optional | - | Azure Document Intelligence endpoint (recommended) |
| `AZURE_CV_KEY` | Optional | - | Azure Computer Vision API key (legacy support) |
| `AZURE_CV_ENDPOINT` | Optional | - | Azure Computer Vision endpoint (legacy support) |

---

## Free Tier Limitations

- **750 hours/month** - Enough for 24/7 operation (~93% uptime)
- **Spins down after 15 min** - First load can be slow
- **512MB RAM** - Should be sufficient for this app
- **100GB bandwidth** - Plenty for typical usage

---

## Need Help?

- Check Render logs: Dashboard → Your Service → Logs
- Common issues are documented above
- Render support: https://render.com/docs

---

## Next Steps

Once deployed, you can:
- Set up a custom domain (paid feature)
- Add a PostgreSQL database (if you want persistent storage)
- Enable automatic HTTPS (enabled by default)

**That's it! Your app should now be live on Render! 🎉**
