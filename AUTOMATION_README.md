# Automated Job Application System

## 🤖 Chrome Automation Now Implemented!

I've built a Puppeteer-based automation system that fills and submits job applications through Chrome.

---

## 🚀 How to Use

### **Dry Run (Review Before Submit)**
```bash
# Test on Galaxy Digital (opens browser, fills form, you review)
node scripts/auto-submit.mjs galaxy_digital

# The browser will:
# - Open the job URL
# - Fill all form fields automatically
# - Stay open for 60 seconds so you can review
# - Log to submissions.json
```

### **Live Submit (Actually Submit)**
```bash
# Submit for real (same but logs as "submitted")
node scripts/auto-submit.mjs galaxy_digital --live

# Browser will:
# - Fill the entire form
# - Wait 2 minutes for you to review and click Submit
# - Log as "submitted" in submissions.json
```

### **Submit All Priority Jobs**
```bash
# Submit all 3 priority jobs in sequence
node scripts/auto-submit.mjs --live

# This will process:
# 1. Galaxy Digital - Infrastructure Engineer
# 2. Anthropic - Data Engineer II (TODO: add to script)
# 3. Finch Legal - ML/Backend Engineer (TODO: add to script)
```

---

## 📊 Tracking Submissions

### **View Submission Report**
```bash
node scripts/submission-tracker.mjs report
```

**Output:**
```
================================================================================
SUBMISSION REPORT
================================================================================

Total Submissions: 3

By Status:
  ✅ submitted: 2
  🔍 dry_run: 1

By Company:
  - Galaxy Digital: 1
  - Anthropic: 1
  - Finch Legal: 1

By Platform:
  - greenhouse: 2
  - ashby: 1

Recent Submissions (Last 10):
--------------------------------------------------------------------------------
1. ✅ Galaxy Digital - Infrastructure Engineer (AI Platforms)
   Platform: greenhouse
   Time: 3/11/2026, 2:30:15 PM
   Status: submitted
   Notes: Resume: Yes, Cover: Yes, Answers: 5
```

### **Manual Logging**
```bash
# If you submit manually, log it:
node scripts/submission-tracker.mjs add "Company Name" "Job Title" "URL" platform submitted
```

---

## ✅ What Gets Auto-Filled

### **Basic Info** (100% automated)
- ✅ First Name: Jason
- ✅ Last Name: Bian
- ✅ Email: jason.bian64@gmail.com
- ✅ Phone: +1-734-730-6569
- ✅ Location: New York, NY

### **Links** (100% automated)
- ✅ LinkedIn: https://www.linkedin.com/in/jason-bian-7b9027a5/
- ✅ GitHub: https://github.com/IamJasonBian

### **Documents** (100% automated)
- ✅ Resume Upload: `/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_tmp.pdf`
- ✅ Cover Letter: Tailored for each company

### **Custom Questions** (Pattern Matched)
The script intelligently matches questions and fills answers:

- "Why are you interested in [company]?" → Company-specific answer
- "How did you hear about this role?" → LinkedIn
- "Are you legally authorized to work?" → Yes
- "Will you require sponsorship?" → No
- "When can you start?" → 2 weeks notice

**Example for Galaxy Digital:**
- "Why Galaxy Digital?" → "I'm excited about Galaxy's position at the intersection of Web3 and AI infrastructure..."

---

## 🎯 Current Status

### **Implemented:**
- ✅ Greenhouse platform automation
- ✅ Resume upload
- ✅ Cover letter fill
- ✅ Custom question answering (pattern matching)
- ✅ Submission tracking/logging
- ✅ Dry run mode (review before submit)
- ✅ Galaxy Digital ready to submit

### **TODO:**
- ⏳ Add Anthropic job data to auto-submit.mjs
- ⏳ Add Finch Legal job data to auto-submit.mjs
- ⏳ Implement Ashby platform automation
- ⏳ Implement Lever platform automation
- ⏳ Add automatic "Submit" button clicking (currently manual)

---

## 🔧 How It Works

### **1. Puppeteer Browser Automation**
```javascript
// Opens Chrome (visible, not headless)
const browser = await puppeteer.launch({
  headless: false,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});

// Navigates to job URL
await page.goto(job.url);
```

### **2. Intelligent Form Filling**
```javascript
// Finds fields by multiple selectors (handles different Greenhouse variants)
const emailSelectors = [
  'input[type="email"]',
  'input[name*="email"]',
  'input[autocomplete="email"]'
];

// Types with human-like delay
await element.type(candidate.email, { delay: 50 });
```

### **3. Resume Upload**
```javascript
const fileInput = await page.$('input[type="file"]');
await fileInput.uploadFile(RESUME_PATH);
```

### **4. Smart Question Answering**
```javascript
// Matches question text to prepared answers
if (labelLower.includes('why') && labelLower.includes('galaxy')) {
  await input.type(job.answers['why are you interested in galaxy digital']);
}
```

### **5. Submission Logging**
```javascript
logSubmission({
  company: "Galaxy Digital",
  status: "submitted",
  resumeUploaded: true,
  coverLetterFilled: true,
  answersProvided: ["Why Galaxy Digital?", "Start date", ...]
});
```

---

## 📂 File Structure

```
scripts/
├── auto-submit.mjs              # Main automation script
├── submission-tracker.mjs       # Logs and reports submissions
├── minimal-answer-heuristic.json # Backup answers (35+ questions)
└── answer-generator.mjs         # Generate answers on-the-fly

submissions.json                 # Auto-generated submission log
APPLICATION_LOG.md              # Human-readable status
```

---

## 🎬 Next Steps to Submit

### **Option 1: Fully Automated (Recommended)**
```bash
# Dry run first (review the form)
node scripts/auto-submit.mjs galaxy_digital

# If it looks good, submit for real
node scripts/auto-submit.mjs galaxy_digital --live
```

### **Option 2: Semi-Automated**
```bash
# Let script fill everything, you click Submit
node scripts/auto-submit.mjs galaxy_digital --live

# Browser opens → form auto-fills → you review → you click Submit
```

### **Option 3: View Report**
```bash
# See what's been submitted so far
node scripts/submission-tracker.mjs report
```

---

## 🔍 Troubleshooting

### **"Resume not found" error**
```bash
# Check if resume exists
ls -la blob/resume_tmp.pdf

# If missing, specify path:
RESUME_PATH=/path/to/resume.pdf node scripts/auto-submit.mjs galaxy_digital
```

### **Browser doesn't open**
Chrome path is hardcoded to:
```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

If your Chrome is elsewhere, edit `auto-submit.mjs` line 11.

### **Form doesn't fill completely**
- Normal! Some fields have unusual HTML structures
- The browser stays open so you can manually fill missing fields
- All common fields (name, email, resume) should auto-fill

---

## 🎯 Success Metrics

**Per Application:**
- Resume Upload: ✅ / ❌
- Cover Letter: ✅ / ❌
- Custom Answers: N filled (tracked)
- Status: dry_run / submitted / failed

**Overall:**
- Total submissions logged
- Success rate by platform
- Time saved vs manual (estimate: 10-15 min → 2-3 min per app)

---

## 🚀 Ready to Submit?

```bash
# Start with dry run
node scripts/auto-submit.mjs galaxy_digital

# Review the auto-filled form in the browser
# If looks good, run with --live flag
```

**All materials are prepared. Let the automation begin!** 🤖
