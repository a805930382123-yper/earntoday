"""Small Windows desktop helper for isolated native menu acceptance."""
import ctypes
import sys
from PIL import ImageGrab

user32 = ctypes.windll.user32
action = sys.argv[1]
if action == "cursor":
    user32.SetCursorPos(int(sys.argv[2]), int(sys.argv[3]))
elif action == "capture":
    x, y, width, height = map(int, sys.argv[3:7])
    ImageGrab.grab().crop((x, y, x + width, y + height)).save(sys.argv[2])
elif action == "escape":
    user32.keybd_event(0x1B, 0, 0, 0)
    user32.keybd_event(0x1B, 0, 2, 0)
elif action == "click":
    user32.SetCursorPos(int(sys.argv[2]), int(sys.argv[3]))
    user32.mouse_event(0x0002, 0, 0, 0, 0)
    user32.mouse_event(0x0004, 0, 0, 0, 0)
elif action == "right-click":
    user32.SetCursorPos(int(sys.argv[2]), int(sys.argv[3]))
    user32.mouse_event(0x0008, 0, 0, 0, 0)
    user32.mouse_event(0x0010, 0, 0, 0, 0)
elif action == "tray-right":
    target = int(sys.argv[2])
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    found = []
    def visit(hwnd, _):
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        name = ctypes.create_unicode_buffer(128)
        user32.GetClassNameW(hwnd, name, 128)
        if pid.value == target and name.value == "tray_icon_app":
            found.append(hwnd)
            return False
        return True
    user32.EnumWindows(callback_type(visit), 0)
    if not found:
        raise RuntimeError("Test tray window not found")
    user32.PostMessageW(found[0], 6002, 0, 0x0205)
elif action == "menu-visible":
    target = int(sys.argv[2])
    callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    found = []
    def visit(hwnd, _):
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        name = ctypes.create_unicode_buffer(128)
        user32.GetClassNameW(hwnd, name, 128)
        if pid.value == target and name.value == "#32768" and user32.IsWindowVisible(hwnd):
            found.append(hwnd)
        return True
    user32.EnumWindows(callback_type(visit), 0)
    print(len(found))
else:
    raise ValueError(action)
