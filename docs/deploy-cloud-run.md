# Deploy on Google Cloud Run

The Dockerfile builds a standalone Next.js server on port 8080. These steps use Cloud Build, Artifact Registry, Firestore and Cloud Storage in one project. Replace `PROJECT`, `REGION` (for example `asia-southeast1`) and `inbox` with your own values.

## 1. One-time setup

```bash
gcloud config set project PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com storage.googleapis.com

# an image repository
gcloud artifacts repositories create task-inbox --repository-format docker --location REGION

# a Firestore database (Native mode). Omit --database to use the project's default database.
gcloud firestore databases create --database task-inbox --location REGION

# a bucket for attachments (private; the service reads it with its own identity)
gcloud storage buckets create gs://PROJECT-task-inbox --location REGION --uniform-bucket-level-access

# a service account for the service, with just what it needs
gcloud iam service-accounts create task-inbox-run
gcloud projects add-iam-policy-binding PROJECT --member serviceAccount:task-inbox-run@PROJECT.iam.gserviceaccount.com --role roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://PROJECT-task-inbox --member serviceAccount:task-inbox-run@PROJECT.iam.gserviceaccount.com --role roles/storage.objectAdmin
```

## 2. Build and deploy

```bash
SHA=$(git rev-parse --short HEAD)
gcloud builds submit . --tag REGION-docker.pkg.dev/PROJECT/task-inbox/task-inbox:$SHA

gcloud run deploy inbox \
  --image REGION-docker.pkg.dev/PROJECT/task-inbox/task-inbox:$SHA \
  --region REGION --allow-unauthenticated \
  --service-account task-inbox-run@PROJECT.iam.gserviceaccount.com \
  --min-instances 0 --max-instances 3 --memory 512Mi \
  --set-env-vars INBOX_NAME="My Team Inbox",INBOX_SYSTEMS="web:Website,api:API,mobile:Mobile,other:Other",FIREBASE_PROJECT_ID=PROJECT,FIRESTORE_DATABASE_ID=task-inbox,GCS_BUCKET=PROJECT-task-inbox,PUBLIC_BASE_URL=https://inbox.example.com \
  --set-secrets SESSION_SECRET=task-inbox-session:latest,SETUP_CODE=task-inbox-setup:latest
```

Create the two secrets first (`openssl rand -hex 32` for the session secret, anything you can type for the setup code) with `gcloud secrets create … --data-file=-`, and grant the service account `roles/secretmanager.secretAccessor` on them.

Later deploys use `--update-env-vars` so the rest stays as it is. Once the first admin exists, remove `SETUP_CODE` (`--remove-secrets SETUP_CODE`) so `/setup` stays closed.

## 3. First login

Open `https://<service url>/setup`, enter the setup code, create the admin. From **Settings → Team** create accounts for the team; from **Settings → Claude / CLI** create a token and run the install command on the developer's machine.

## 4. Custom domain

`gcloud beta run domain-mappings create --service inbox --domain inbox.example.com --region REGION`, then add the DNS record it prints. Set `PUBLIC_BASE_URL` to the new URL.

## Costs and limits

A small team fits comfortably in the free tiers of Cloud Run, Firestore and Cloud Storage. Uploads are capped at 30 MB per file because Cloud Run takes 32 MB per request.
