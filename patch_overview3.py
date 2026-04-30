import re

with open(r'pages\dashboard.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(r'overview_v2.tmp', 'r', encoding='utf-8') as f:
    new_component = f.read()

# Find the start of the current OverviewTab section
# It starts with design tokens/helpers (OV_COLORS or the function OverviewTab line)
# and ends right before "const TABS"

start_line = None
end_line = None

for i, line in enumerate(lines):
    # Find the start - the old OverviewTab function
    if line.strip().startswith('function OverviewTab(') and start_line is None:
        start_line = i
    # Find the end - const TABS line
    if line.strip().startswith("const TABS = [") and end_line is None:
        end_line = i

print(f"Old OverviewTab: lines {start_line+1} to {end_line}")
print(f"Old section: {end_line - start_line} lines")

if start_line is None or end_line is None:
    print("ERROR: Could not find boundaries!")
    exit(1)

# Replace the old section with new component
new_lines = lines[:start_line] + [new_component + '\n'] + lines[end_line:]

with open(r'pages\dashboard.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

total = len(new_lines)
# Recount properly
with open(r'pages\dashboard.js', 'r', encoding='utf-8') as f:
    total = len(f.readlines())
print(f"Done! dashboard.js now {total} lines")
