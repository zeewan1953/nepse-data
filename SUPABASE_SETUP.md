# Supabase Setup Guide for Vercel Deployment

## Step 1: Run SQL Migration

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/tnbdujuoofevbqognyzc
2. Navigate to **SQL Editor** (left sidebar)
3. Copy the contents of `supabase-migration.sql`
4. Paste and click **Run**
5. Verify tables are created in **Table Editor**

## Step 2: Get Your Supabase Service Role Key

1. Go to: https://supabase.com/dashboard/project/tnbdujuoofevbqognyzc/settings/api
2. Find **Project API keys** section
3. Copy the `service_role` key (not the anon key)
4. Update `.env.local`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key_here
   ```

## Step 3: Add Environment Variables to Vercel

1. Go to: https://vercel.com/zeewan-s-projects/nepse-data/settings/environment-variables
2. Add these variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://tnbdujuoofevbqognyzc.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   GROQ_API_KEY=your_groq_key
   JWT_SECRET=dari-sir-nepse-super-secret-jwt-key-2026
   RESEND_API_KEY=your_resend_key
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   NEPSE_BASE_URL=https://nepalstock.com
   ```

## Step 4: Redeploy to Vercel

After adding environment variables:
1. Go to: https://vercel.com/zeewan-s-projects/nepse-data
2. Click **Redeploy** on the latest deployment
3. Wait for build to complete

## Step 5: Test

Visit: https://nepse-data-atkqrzm0x-zeewan-s-projects.vercel.app/dashboard

The dashboard will now:
- ✅ Store market data in Supabase (PostgreSQL)
- ✅ Access data from Vercel serverless functions
- ✅ Show real-time data during market hours
- ✅ Cache computed signals in broker_flow_cache table

## Notes

- Supabase is cloud-hosted PostgreSQL (works with Vercel)
- Data persists across deployments
- Free tier: 500MB database, 2GB bandwidth/month
- Tables are optimized with indexes for fast queries
