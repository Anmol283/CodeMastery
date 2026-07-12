# 💻 CodeMastery - DSA and Interview Platform

<div align="center">
  <img src="https://github.com/user-attachments/assets/f75964ce-d558-4b82-a66b-302f5acc4a3f" alt="CodeMastery preview" width="520" />
</div>
</br>
</br>
<i> <div align="center">
CodeMastery is a full-stack practice platform for Data Structures and Algorithms. It helps learners solve problems, track progress, and explore guided content through a polished React frontend and an Express backend with built-in code execution.
</div>
</i>

---

## 📚 Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [How the app works](#how-the-app-works)
- [Directory structure](#directory-structure)
- [Quick start](#quick-start)
- [User flows](#user-flows)
- [Useful commands](#useful-commands)
- [License](#license)

---

## 🌟 Overview

CodeMastery combines a problem library, an interactive editor, a learner dashboard, and role-based admin tools in a single experience. Users can browse problems, write solutions, run tests, and track achievements without leaving the platform.

---

## ✨ Features

- Problem browsing by difficulty, topic, and category
- Interactive coding with Monaco Editor and test-case execution
- Dashboard with streaks, progress, badges, and daily challenges
- Contest and leaderboard support for extra practice
- Admin and interviewer tools for adding and managing content

---

## 🛠️ Tech stack

<div align="center">

| Category | Stack |
|---|---|
| Frontend | <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" /> <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" /> <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" /> |
| Backend | <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" /> <img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" /> |
| Data layer | <img src="https://img.shields.io/badge/Sequelize-52B0E7?style=for-the-badge&logo=sequelize&logoColor=white" /> <img src="https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white" /> |
| Editor | <img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" /> |
| Testing | <img src="https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white" /> |

</div>

---

## 🔄 How the app works

```mermaid
flowchart TD
    A[User signs in] --> B[Dashboard]
    B --> C[Browse problems]
    C --> D[Open coding editor]
    D --> E[Write solution]
    E --> F[Run tests]
    F --> G[View results]
    G --> H[Track progress, badges, streaks]
    B --> I[Admin / interviewer tools]
```

<i> This flow gives a simple view of how learners move from onboarding to problem solving and progress tracking. </i>

---

## 📁 Directory structure

```text
CodeMastery/
├── components/          # Reusable UI components
├── src/                 # React app pages and app routing
├── server/              # Express routes, services, controllers, and DB setup
├── public/              # Static assets
├── guides/              # Setup and documentation notes
└── package.json         # Scripts and dependencies
```

---

## 🚀 Quick start

### 1. Prerequisites

Make sure you have:

- Node.js 18+ installed
- npm or pnpm installed
- A MySQL database available
- Redis optionally enabled for cached auth/session behavior

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root with values similar to:

```env
PORT=4000
DATABASE_URL=mysql://user:password@localhost:3306/codemastery
JWT_SECRET=change-this-secret
REDIS_URL=redis://localhost:6379
```

If your setup uses Clerk-based auth, add the appropriate Clerk keys as well.

### 4. Start the app

```bash
npm run dev
```

This starts:

- the Vite frontend at http://localhost:5173
- the Express backend at http://localhost:4000

You can also run each part separately:

```bash
npm run dev:client
npm run dev:server
```

---

## 👤 User flows

### Learner

1. Sign up or log in
2. Open the dashboard to view progress and daily goals
3. Browse problems and choose one to solve
4. Use the editor to write a solution and run it against test cases
5. Review the results and continue to the next challenge

### Interviewer / admin

1. Log in with the correct role
2. Add or manage problems and topics
3. Create contests or manage challenge content
4. Review admin dashboards and platform activity

---

## ⚙️ Useful commands

```bash
npm run build       # build the frontend for production
npm start           # start the backend server only
npm test            # run Jest tests
npm run test:e2e    # run end-to-end tests
```
---

## 📜 License

This project is licensed under the MIT License.
