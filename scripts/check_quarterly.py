import urllib.request, urllib.parse, re

url = 'https://eng.merolagani.com/CompanyReports.aspx?type=QUARTERLY&symbol=NABIL'
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
req = urllib.request.Request(url, headers=headers)
html = urllib.request.urlopen(req).read().decode('utf-8')

# Extract form state
vs = re.search(r'id="__VIEWSTATE" value="([^"]+)"', html).group(1)
ev = re.search(r'id="__EVENTVALIDATION" value="([^"]+)"', html).group(1)
vsg = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]+)"', html)
vsg = vsg.group(1) if vsg else ''

# Build form data for NABIL quarterly
form = {
    '__VIEWSTATE': vs,
    '__EVENTVALIDATION': ev,
    '__VIEWSTATEGENERATOR': vsg,
    'ctl00$ContentPlaceHolder1$ASCompanyFilter$txtAutoSuggest': 'NABIL',
    'ctl00$ContentPlaceHolder1$ASCompanyFilter$hdnAutoSuggest': 'NABIL',
    'ctl00$ContentPlaceHolder1$ddlSectorFilter': '0',
    'ctl00$ContentPlaceHolder1$ddlFiscalYearFilter': '',
    'ctl00$ContentPlaceHolder1$lbtnSearch': 'Search',
}
data = urllib.parse.urlencode(form).encode('utf-8')

req2 = urllib.request.Request(url, data=data, headers={
    **headers,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': url,
})
resp2 = urllib.request.urlopen(req2)
html2 = resp2.read().decode('utf-8')

# Look for the table in the response
# Find the reports table
idx = html2.find('gvReport')
if idx < 0:
    idx = html2.find('report-table')
if idx < 0:
    idx = html2.find('table')
    
if idx >= 0:
    print(f'Found content at {idx}')
    print(html2[idx:idx+3000])
else:
    print(f'Response length: {len(html2)}')
    # Look for any data grid
    grids = re.findall(r'<table[^>]*class="[^"]*gvReport[^"]*"[^>]*>.*?</table>', html2, re.DOTALL)
    print(f'Found {len(grids)} report grids')
    if grids:
        print(grids[0][:3000])
    else:
        # Check for any table with data
        all_tables = re.findall(r'<table[^>]*>.*?</table>', html2, re.DOTALL)
        print(f'Total tables: {len(all_tables)}')
        for i, t in enumerate(all_tables):
            if len(t) > 500:
                print(f'\nTable {i} (len={len(t)}): {t[:1000]}')
