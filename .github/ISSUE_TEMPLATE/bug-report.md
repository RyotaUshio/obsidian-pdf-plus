---
name: Bug report
about: Create a bug report to help us improve
title: "[Bug] "
labels: bug
assignees: ''

---

<!--- Please note: we consider a problem as a bug only if it can be reproducible in the sandbox vault where only PDF++ (and other relevant plugins if any) are enabled. If this is not the case, ask a question in the GitHub Discussions: https://github.com/RyotaUshio/obsidian-pdf-plus/discussions --->

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Describe the detailed steps to reproduce the behavior in the sandbox vault. If possible, attach a PDF file where you face the problem.

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screen recordings or screenshots**
Add screen recordings that capture the situation the bug is happening. If it's difficult, add screenshots instead.

**Additional context (optional)**
Add any other context about the problem here.

body:
  - type: textarea
    id: obsidian-debug-info
    attributes:
      label: Obsidian debug info
      description: From the command palette, run the command `Show debug info`. Then select `Copy to clipboard` and paste the result here.
      placeholder: 
    validations:
      required: true
  - type: textarea
    id: pdf-plus-debug-info
    attributes:
      label: 'PDF++ debug info'
      description: From the command palette, run the command `PDF++: Copy debug info`. Then paste the result here.
      placeholder:
      render: json
    validations:
      required: true
