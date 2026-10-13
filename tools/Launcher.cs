using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

internal static class Launcher
{
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int command);

    private const string AppExecutableName = "earn-today.exe";
    private const string AppProcessName = "earn-today";

    [STAThread]
    private static int Main()
    {
        try
        {
            string launcherDirectory = Path.GetFullPath(Path.GetDirectoryName(
                Assembly.GetExecutingAssembly().Location) ?? Directory.GetCurrentDirectory());
            string appPath = Path.Combine(
                launcherDirectory, "src-tauri", "target", "release", AppExecutableName);

            if (!File.Exists(appPath))
            {
                ShowError("Launcher EXE must stay in the project root. Missing file:\r\n" + appPath);
                return 1;
            }

            foreach (Process process in Process.GetProcessesByName(AppProcessName))
            {
                if (!IsSameProcess(process, appPath))
                {
                    continue;
                }

                IntPtr window = process.MainWindowHandle;
                if (window != IntPtr.Zero)
                {
                    ShowWindowAsync(window, 9);
                    SetForegroundWindow(window);
                    return 0;
                }

                // The app intentionally hides to the system tray and keeps no
                // regular window handle, so start a fresh visible instance.
                KillProcessTree(process.Id);
                process.WaitForExit(3000);
                break;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = appPath,
                WorkingDirectory = launcherDirectory,
                UseShellExecute = true,
            });
            return 0;
        }
        catch (Exception error)
        {
            ShowError(error.ToString());
            return 1;
        }
    }

    private static bool IsSameProcess(Process process, string appPath)
    {
        try
        {
            string path = process.MainModule == null ? "" : process.MainModule.FileName;
            return string.Equals(path, appPath, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static void ShowError(string message)
    {
        MessageBox((IntPtr)0, message, "Earn Today Launcher", 0x10);
    }

    private static void KillProcessTree(int processId)
    {
        Process taskkill = Process.Start(new ProcessStartInfo
        {
            FileName = "taskkill.exe",
            Arguments = "/PID " + processId.ToString(System.Globalization.CultureInfo.InvariantCulture) + " /T /F",
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        if (taskkill != null)
        {
            taskkill.WaitForExit(3000);
            taskkill.Dispose();
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr owner, string text, string caption, uint type);
}
