# DynamoDB Setup Guide

## Prerequisites
- AWS account with DynamoDB access
- DynamoDB table named `user_tokens` created
- AWS credentials configured

## Environment Variables

Set the following environment variables for DynamoDB authentication:

### For Local Development
```bash
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
export AWS_REGION="us-east-1"  # or your preferred region
```

### For Production (Vercel, etc.)
Add these environment variables in your deployment platform:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

## DynamoDB Table Schema

Your `user_tokens` table should have:
- **Primary Key**: `jti` (String)
- **Attributes**:
  - `user_id` (String)
  - `email` (String)
  - `name` (String, optional)
  - `google_tokens` (Map)
    - `access_token` (String)
    - `refresh_token` (String)
    - `expiry_date` (Number)
    - `scopes` (List of Strings)
  - `created_at` (String)
  - `updated_at` (String)
  - `last_used` (String, optional)

## Testing the Setup

1. Set your AWS credentials
2. Run your application
3. Check the console logs for DynamoDB connection status

## Migration from Firestore

If you have existing data in Firestore, you'll need to migrate it to DynamoDB. The data structure should be compatible with the new DynamoDB schema.

## Troubleshooting

- **Access Denied**: Check your AWS credentials and IAM permissions
- **Table Not Found**: Ensure the table name is `user_tokens` and exists in the specified region
- **Region Issues**: Make sure `AWS_REGION` matches your DynamoDB table's region 