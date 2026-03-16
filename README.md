# record-AI-backend

## Adding employees

When you add an employee (via the app), the backend:

1. Creates a new user (or links an existing user who has no company) with the email you entered.
2. Assigns a **default password** (from `DEFAULT_EMPLOYEE_PASSWORD` in `.env`, or a random one if not set).
3. Adds them to your company as an employee.
4. Sends them an **email with their login credentials**: email and password.

**What the employee does:** Open the Record AI app, tap Sign in, and use the **email and password** from that email. They can change their password after first login if you add that flow.
