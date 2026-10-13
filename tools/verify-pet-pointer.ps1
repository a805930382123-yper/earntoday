param([int]$TaskProcessId, [int]$TaskX, [int]$TaskY, [ValidateSet('click','drag')][string]$Action)
$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $TaskProcessId
$expectedPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/target/release/earn-today.exe'))
if ($taskProcess.Path -ne $expectedPath) { throw 'Pointer test refused: target is not this workspace app.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PetPointerTest {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr w);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr w, out Rect r);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
}
'@
[PetPointerTest]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$taskHandle = $taskProcess.MainWindowHandle
if ($taskHandle -eq [IntPtr]::Zero) { throw 'No visible test window.' }
[PetPointerTest]::SetForegroundWindow($taskHandle) | Out-Null
Start-Sleep -Milliseconds 150
if ([PetPointerTest]::GetForegroundWindow() -ne $taskHandle) {
  # Windows may reject foreground transfer from an automated helper. Temporarily
  # attach input queues, focus only the verified workspace app, then detach.
  $foregroundPid = [uint32]0
  $foregroundThread = [PetPointerTest]::GetWindowThreadProcessId([PetPointerTest]::GetForegroundWindow(), [ref]$foregroundPid)
  $taskThread = [PetPointerTest]::GetCurrentThreadId()
  $attached = [PetPointerTest]::AttachThreadInput($taskThread, $foregroundThread, $true)
  try { [PetPointerTest]::SetForegroundWindow($taskHandle) | Out-Null }
  finally { if ($attached) { [PetPointerTest]::AttachThreadInput($taskThread, $foregroundThread, $false) | Out-Null } }
  Start-Sleep -Milliseconds 150
}
if ([PetPointerTest]::GetForegroundWindow() -ne $taskHandle) { throw 'Pointer test refused: app is not foreground.' }
$taskRect = New-Object PetPointerTest+Rect
[PetPointerTest]::GetWindowRect($taskHandle, [ref]$taskRect) | Out-Null
if ($TaskX -lt $taskRect.L -or $TaskX -ge $taskRect.R -or $TaskY -lt $taskRect.T -or $TaskY -ge $taskRect.B) { throw 'Pointer target outside app.' }
$oldCursor = New-Object PetPointerTest+Point
[PetPointerTest]::GetCursorPos([ref]$oldCursor) | Out-Null
try {
  [PetPointerTest]::SetCursorPos($TaskX, $TaskY) | Out-Null
  [PetPointerTest]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  if ($Action -eq 'drag') {
    [PetPointerTest]::SetCursorPos(($TaskX - 10), ($TaskY + 5)) | Out-Null
    Start-Sleep -Milliseconds 180
    [PetPointerTest]::SetCursorPos(($TaskX - 35), ($TaskY + 18)) | Out-Null
    Start-Sleep -Milliseconds 180
  } else {
    # Two physical pixels of normal hand jitter must still count as a click.
    [PetPointerTest]::SetCursorPos(($TaskX + 2), $TaskY) | Out-Null
  }
} finally {
  [PetPointerTest]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 150
  [PetPointerTest]::SetCursorPos($oldCursor.X, $oldCursor.Y) | Out-Null
}
