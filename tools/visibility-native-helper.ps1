# Test helper: only the fixed registered chord and windows owned by the test PID.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class VisibilityNativeTest {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
    [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    static IntPtr Find(uint target) {
        IntPtr result = IntPtr.Zero;
        EnumWindows((hwnd, param) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            var text = new StringBuilder(128); GetWindowText(hwnd, text, text.Capacity);
            if (pid == target && text.ToString() == "\u4eca\u5929\u53c8\u8d5a\u4e86\u591a\u5c11") { result = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        if (result == IntPtr.Zero) throw new Exception("Test window not found");
        return result;
    }
    public static string Snapshot(uint pid) {
        var hwnd = Find(pid); Rect r; if (!GetWindowRect(hwnd, out r)) throw new Exception("GetWindowRect failed");
        return "{\"visible\":" + (IsWindowVisible(hwnd) ? "true" : "false") + ",\"x\":" + r.Left + ",\"y\":" + r.Top + ",\"width\":" + (r.Right-r.Left) + ",\"height\":" + (r.Bottom-r.Top) + "}";
    }
    public static void Close(uint pid) { if (!PostMessage(Find(pid), 0x0010, IntPtr.Zero, IntPtr.Zero)) throw new Exception("WM_CLOSE failed"); }
    public static void TrayClick(uint target) {
        IntPtr tray = IntPtr.Zero;
        EnumWindows((hwnd, param) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            var name = new StringBuilder(128); GetClassName(hwnd, name, name.Capacity);
            if (pid == target && name.ToString() == "tray_icon_app") { tray = hwnd; return false; }
            return true;
        }, IntPtr.Zero);
        // tray-icon 0.25: deliver the same callback as Explorer's left-button-up.
        if (tray == IntPtr.Zero || !PostMessage(tray, 6002, IntPtr.Zero, new IntPtr(0x0202))) throw new Exception("Tray callback failed");
    }
    public static void Press(bool repeat) {
        keybd_event(0x11, 0, 0, UIntPtr.Zero); keybd_event(0x10, 0, 0, UIntPtr.Zero); keybd_event(0x48, 0, 0, UIntPtr.Zero);
        try {
            if (repeat) for (int i=0; i<12; i++) { System.Threading.Thread.Sleep(50); keybd_event(0x48, 0, 0, UIntPtr.Zero); }
            else System.Threading.Thread.Sleep(100);
        } finally {
            keybd_event(0x48, 0, 2, UIntPtr.Zero); keybd_event(0x10, 0, 2, UIntPtr.Zero); keybd_event(0x11, 0, 2, UIntPtr.Zero);
        }
        System.Threading.Thread.Sleep(150);
    }
}
'@
Write-Output 'READY'
while ($null -ne ($line = [Console]::ReadLine())) {
    try {
        $parts = $line.Split(':')
        switch ($parts[0]) {
            'snapshot' { [VisibilityNativeTest]::Snapshot([uint32]$parts[1]) }
            'close' { [VisibilityNativeTest]::Close([uint32]$parts[1]); 'OK' }
            'tray' { [VisibilityNativeTest]::TrayClick([uint32]$parts[1]); 'OK' }
            'press' { [VisibilityNativeTest]::Press($false); 'OK' }
            'repeat' { [VisibilityNativeTest]::Press($true); 'OK' }
            default { throw 'Unknown helper operation' }
        }
    } catch { Write-Output ('ERROR ' + $_.Exception.Message) }
}
