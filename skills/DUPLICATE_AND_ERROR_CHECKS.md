# DUPLICATE & ERROR CHECKS — Pre-Answer Validation

Run this checklist before delivering any code or file-based answer.

## Duplicate Checks
- [ ] No duplicate function definitions
- [ ] No duplicate class definitions
- [ ] No duplicate variable declarations
- [ ] No duplicate config keys
- [ ] No duplicate file blocks or repeated sections
- [ ] No repeated instructions across skill files

## Conflict Checks
- [ ] No conflicting rules between new and existing code
- [ ] No conflicting logic (e.g., two functions setting the same state differently)
- [ ] New code does not contradict locked content behavior

## Reference Checks
- [ ] All imports present and valid
- [ ] No broken function/variable references
- [ ] No references to removed or renamed items
- [ ] All Supabase columns exist in schema (PGRST204 = silent failure)

## File Dependency Checks
- [ ] All files the answer depends on were actually inspected
- [ ] Connected files that should have been checked were checked
- [ ] No answer relies on unread file contents

## Locked Content Check
- [ ] Locked zones (app.py ~421–536, security layer) were NOT modified
- [ ] Locked function signatures unchanged
- [ ] No threshold or scoring weight changes without permission

## Tool: check_dupes.py
Run before every commit:
```
py -3.11 C:\Users\Admin\Desktop\ctrader_trend_scanner\check_dupes.py
```
