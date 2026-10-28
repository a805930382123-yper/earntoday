# Test-only helper, operated solely on an isolated-test process supplied by PID.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AutonomousNativeTest {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    public static IntPtr Find(uint target) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, unused) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            var text = new StringBuilder(128); GetWindowText(hwnd, text, text.Capacity);
            if (pid == target && text.ToString() == "\u4eca\u5929\u53c8\u8d5a\u4e86\u591a\u5c11") { result = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        if (result == IntPtr.Zero) throw new Exception("Isolated window not found");
        return result;
    }
    public static void Minimize(uint target) { ShowWindowAsync(Find(target), 6); }
    public static void Restore(uint target) { ShowWindowAsync(Find(target), 9); }
    public static void RestoreInactive(uint target) { ShowWindowAsync(Find(target), 4); }
    public static string Snapshot(uint target) {
        var hwnd = Find(target);
        return "{\"visible\":"+(IsWindowVisible(hwnd)?"true":"false")+",\"minimized\":"+(IsIconic(hwnd)?"true":"false")+",\"focused\":"+(GetForegroundWindow()==hwnd?"true":"false")+"}";
    }
}
'@
Write-Output 'READY'
while ($null -ne ($line = [Console]::ReadLine())) {
    try {
        $parts = $line.Split(':')
        $targetPid = [uint32]$parts[1]
        switch ($parts[0]) {
            'minimize' { [AutonomousNativeTest]::Minimize($targetPid); 'OK' }
            'restore' { [AutonomousNativeTest]::Restore($targetPid); 'OK' }
            'restore-inactive' { [AutonomousNativeTest]::RestoreInactive($targetPid); 'OK' }
            'snapshot' { [AutonomousNativeTest]::Snapshot($targetPid) }
            'metrics' {
                $processList = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
                $selected = @($targetPid)
                do {
                    $next = @($processList | Where-Object { $_.ParentProcessId -in $selected -and $_.ProcessId -notin $selected } | ForEach-Object { $_.ProcessId })
                    $selected += $next
                } while ($next.Count -gt 0)
                $items = @(Get-Process -Id $selected -ErrorAction SilentlyContinue)
                [pscustomobject]@{ pids=$selected; cpuSeconds=($items | Measure-Object CPU -Sum).Sum; workingSetBytes=($items | Measure-Object WorkingSet64 -Sum).Sum; sampledAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Compress
            }
            default { throw 'Unknown test operation' }
        }
    } catch { Write-Output ('ERROR ' + $_.Exception.Message) }
}
