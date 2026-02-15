# StudyPro Academy (Full-Stack)

This project now includes:

- User register/login (JWT cookie auth)
- Single subscription plans valid for all sections:
  - `Rs 9` for 1 day
  - `Rs 29` for 7 days
  - `Rs 99` for 30 days
- Access control for `courses`, `books`, `pyqs`, `mock`
- Payment records + subscription records in local JSON DB (`data.json`)
- Admin reporting for users/payments/revenue

## Run Locally

1. Install dependencies:
   - `npm install`
2. Start server:
   - `npm start`
3. Open:
   - `http://localhost:3000`

## Default Admin

- Email: `admin@studypro.local`
- Password: `Admin@123`

You can override using env vars:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

## Important Deployment Note

GitHub Pages cannot run Node.js backend APIs.
For this full-stack version, deploy on a Node host (Render, Railway, VPS, etc.).
# azedusite
