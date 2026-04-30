import re

# Read files
with open(r'pages\dashboard.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(r'overview_component.tmp', 'r', encoding='utf-8') as f:
    comp = f.read()

# Close the incomplete component (missing closing tags)
comp = comp.rstrip() + "\n\n    </div>\n  );\n}\n\n"

# Find insertion points
tabs_line = None
tab_feature_line = None
usestate_panels_line = None
panels_render_line = None

for i, line in enumerate(lines):
    if line.strip().startswith("const TABS = [") and tabs_line is None:
        tabs_line = i
    if "'PANELS':      'panels'," in line and tab_feature_line is None:
        tab_feature_line = i
    if "useState('PANELS')" in line and usestate_panels_line is None:
        usestate_panels_line = i
    if "):tab==='PANELS'?(" in line and panels_render_line is None:
        panels_render_line = i

print(f"TABS line: {tabs_line}")
print(f"TAB_FEATURE PANELS line: {tab_feature_line}")
print(f"useState PANELS line: {usestate_panels_line}")
print(f"PANELS render line: {panels_render_line}")

if not all([tabs_line, tab_feature_line, usestate_panels_line, panels_render_line]):
    print("ERROR: Could not find all insertion points!")
    exit(1)

# EDIT 1: Insert component before const TABS
comp_lines = comp.splitlines(True)
lines[tabs_line:tabs_line] = comp_lines

# Recalculate offsets (comp added len(comp_lines) lines)
offset = len(comp_lines)

# EDIT 2: Add 'OVERVIEW' as first item in TABS array
ti = tabs_line + offset
old_tabs = lines[ti]
lines[ti] = old_tabs.replace("const TABS = ['PANELS',", "const TABS = ['OVERVIEW','PANELS',")
print(f"TABS edit: {'OK' if 'OVERVIEW' in lines[ti] else 'FAILED'}")

# EDIT 3: Add OVERVIEW to TAB_FEATURE (insert line before PANELS)
tfi = tab_feature_line + offset
insert_line = "  'OVERVIEW':    'panels',\n"
lines.insert(tfi, insert_line)
offset += 1
print("TAB_FEATURE edit: OK")

# EDIT 4: Change useState('PANELS') to useState('OVERVIEW')
usi = usestate_panels_line + offset
lines[usi] = lines[usi].replace("useState('PANELS')", "useState('OVERVIEW')")
print(f"useState edit: {'OK' if 'OVERVIEW' in lines[usi] else 'FAILED'}")

# EDIT 5: Add OVERVIEW tab render before PANELS render
pri = panels_render_line + offset
overview_render = "):tab==='OVERVIEW'?(\n<OverviewTab data={data} trends={trends} pdrData={pdrData} upcomingNews={upcomingNews} spikes={spikes} confidenceMap={confidenceMap} memoryIndex={memoryIndex} onSelectPair={setSelectedPair} isMobile={isMobile} lastUpdate={lastUpdate}/>\n"
old_panels = lines[pri]
lines[pri] = overview_render + old_panels
print("Render edit: OK")

# Write result
with open(r'pages\dashboard.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

total = len(lines)
print(f"\nDone! dashboard.js now {total} lines")
