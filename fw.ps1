$ErrorActionPreference = "Continue"
$r = & plink -batch -ssh mmak@68.211.73.8 -pw "Thisisthefuture2026#" "curl -s -o /dev/null -w HTTP:%{http_code} http://68.211.73.8:8080/ 2>&1; echo; cat /etc/nginx/sites-enabled/midiakit 2>&1; echo ===HOSTING===; hostnamectl 2>/dev/null | grep -iE 'virtualization|chassis|operating'" 2>&1
$r | Out-File -FilePath "C:\midia kit\fw2.txt" -Encoding utf8
