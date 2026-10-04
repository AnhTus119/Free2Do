# FREE2DO AI

The customer homepage includes an AI chat that can call the backend's allowlisted `search_free2do_activities` tool. The backend runs the existing `/search` logic, so the AI can only explain recommendations returned from the current database.

## Configure

Add these variables to `backend/.env` for local development and to the Render backend service's Environment settings for production:

```env
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-6-luna
```

Keep the API key only in backend environment variables. Never put it in frontend JavaScript or commit a real `.env` file. `gpt-6-luna` is the default model; it can be changed to another model available to your API project. Install dependencies from `backend/requirements.txt` when deploying or setting up locally.

No database migration is needed. The chat requires an authenticated customer account and a selected/GPS location to search activities. Without a location, it can still answer general Free2Do questions and will ask the customer to provide a location before searching.

OpenAI API usage is billed separately from a ChatGPT subscription; charges depend on the model and token usage. Check the API account's current usage and billing controls before enabling the feature for real users.
