import os 
path = 'C:/Users/Admin/panda-dashboard/pages/dashboard.js' 
f = open(path, 'r', encoding='utf-8') 
lines = f.readlines() 
f.close() 
print(f'Lines: {len(lines)}'  ) 
