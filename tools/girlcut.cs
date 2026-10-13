using System;
using System.Drawing;
using System.Drawing.Imaging;

public static class GirlCut {
  public static string Process(string inPath, string outPath) {
    Bitmap src = new Bitmap(inPath);
    int W = src.Width, H = src.Height;
    BitmapData bd = src.LockBits(new Rectangle(0,0,W,H), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    int stride = bd.Stride;
    byte[] px = new byte[stride * H];
    System.Runtime.InteropServices.Marshal.Copy(bd.Scan0, px, 0, px.Length);
    src.UnlockBits(bd);

    int total = W*H;
    int[] q = new int[total];
    int[] dx = {1,-1,0,0}, dy = {0,0,1,-1};

    // 1) 边界泛洪去除近黑背景
    bool[] bg = new bool[total];
    int qh=0, qt=0;
    for (int x=0; x<W; x++) { TrySeed(px, stride, x, 0, bg, W, q, ref qt); TrySeed(px, stride, x, H-1, bg, W, q, ref qt); }
    for (int y=0; y<H; y++) { TrySeed(px, stride, 0, y, bg, W, q, ref qt); TrySeed(px, stride, W-1, y, bg, W, q, ref qt); }
    while (qh < qt) {
      int idx = q[qh++];
      int x = idx % W, y = idx / W;
      for (int d=0; d<4; d++) {
        int nx = x+dx[d], ny = y+dy[d];
        if (nx<0||ny<0||nx>=W||ny>=H) continue;
        int nidx = ny*W+nx;
        if (bg[nidx]) continue;
        int i = ny*stride+nx*4;
        if (px[i+2] < 62 && px[i+1] < 62 && px[i] < 80 && Math.Abs(px[i] - px[i+2]) < 30) { bg[nidx] = true; q[qt++]=nidx; }
      }
    }

    // 1.5) 背景像素透明化
    // 2) 卡片白色内部泛洪
    bool[] card = new bool[total];
    qh=0; qt=0;
    int[] seeds = { 400,650, 1050,650, 350,850, 1100,850, 728,640 };
    for (int s=0; s<seeds.Length; s+=2) {
      int x = seeds[s], y = seeds[s+1];
      if (x>=W||y>=H) continue;
      int i = y*stride+x*4;
      int mn = Math.Min(Math.Min(px[i+2],px[i+1]),px[i]);
      int mx = Math.Max(Math.Max(px[i+2],px[i+1]),px[i]);
      if (mn > 192 && (mx-mn) < 34 && !bg[y*W+x] && !card[y*W+x]) { card[y*W+x]=true; q[qt++]=y*W+x; }
    }
    int cMinX=W, cMaxX=0, cMinY=H, cMaxY=0, cardCount=0;
    while (qh < qt) {
      int idx = q[qh++]; cardCount++;
      int x = idx % W, y = idx / W;
      if (x<cMinX) cMinX=x; if (x>cMaxX) cMaxX=x;
      if (y<cMinY) cMinY=y; if (y>cMaxY) cMaxY=y;
      for (int d=0; d<4; d++) {
        int nx=x+dx[d], ny=y+dy[d];
        if (nx<0||ny<0||nx>=W||ny>=H) continue;
        int nidx = ny*W+nx;
        if (card[nidx] || bg[nidx]) continue;
        int i = ny*stride+nx*4;
        int mn = Math.Min(Math.Min(px[i+2],px[i+1]),px[i]);
        int mx = Math.Max(Math.Max(px[i+2],px[i+1]),px[i]);
        if (mn > 192 && (mx-mn) < 34) { card[nidx]=true; q[qt++]=nidx; }
      }
    }

    // 3) 手部保护框：肤色像素按 x 聚类
    int[] boxFlat = new int[16]; int boxCount = 0;
    int skinCount = 0;
    for (int y=530; y<720 && y<H; y++)
      for (int x=0; x<W; x++) {
        int i = y*stride+x*4;
        int R = px[i+2], G = px[i+1], B = px[i];
        if (R - B > 22 && R > 175 && G > 120 && R > G && G > B) skinCount++;
      }
    if (skinCount > 30) {
      // x 直方图
      int[] xhist = new int[W];
      int[] ymin = new int[W]; int[] ymax = new int[W];
      for (int x=0; x<W; x++) { ymin[x] = int.MaxValue; ymax[x] = -1; }
      for (int y=530; y<720 && y<H; y++)
        for (int x=0; x<W; x++) {
          int i = y*stride+x*4;
          int R = px[i+2], G = px[i+1], B = px[i];
          if (R - B > 22 && R > 175 && G > 120 && R > G && G > B) {
            xhist[x]++; if (y<ymin[x]) ymin[x]=y; if (y>ymax[x]) ymax[x]=y;
          }
        }
      int cx = 0;
      while (cx < W) {
        if (xhist[cx] == 0) { cx++; continue; }
        int x0 = cx;
        while (cx < W && !(xhist[cx]==0 && GapWidth(xhist, cx) >= 60)) cx++;
        int x1 = Math.Min(cx-1, W-1);
        // 该 x 区间的 y 范围
        int mny=int.MaxValue, mxy=0, cnt=0;
        for (int xx=x0; xx<=x1; xx++) {
          cnt += xhist[xx];
          if (ymin[xx] < mny) mny = ymin[xx];
          if (ymax[xx] > mxy) mxy = ymax[xx];
        }
        if (cnt >= 30 && boxCount < 4) {
          boxFlat[boxCount*4] = Math.Max(0, x0-18);
          boxFlat[boxCount*4+1] = Math.Max(0, mny-10);
          boxFlat[boxCount*4+2] = Math.Min(W-1, x1+18);
          boxFlat[boxCount*4+3] = Math.Min(H-1, mxy+30);
          boxCount++;
        }
        if (cx >= W) break;
      }
    }

    // 4) 清除卡片内部
    int expL = Math.Max(0, cMinX-6), expR = Math.Min(W-1, cMaxX+6);
    int expT = Math.Max(0, cMinY-6), expB = Math.Min(H-1, cMaxY+6);
    int keepBlueL = expL + (int)((expR-expL) * 0.30);
    int keepBlueR = expR - (int)((expR-expL) * 0.24);
    int keepBlueB = expT + 175;
    bool[] erased = new bool[total];
    for (int y=expT; y<=expB; y++)
      for (int x2=expL; x2<=expR; x2++) {
        int idx = y*W+x2;
        if (erased[idx]) continue;
        bool inBox = false;
        for (int b=0; b<boxCount; b++) {
          if (x2 >= boxFlat[b*4] && x2 <= boxFlat[b*4+2] && y >= boxFlat[b*4+1] && y <= boxFlat[b*4+3]) { inBox = true; break; }
        }
        if (inBox) continue;
        int i = y*stride+x2*4;
        int R = px[i+2], G = px[i+1], B = px[i];
        bool blue = (B - R > 42 && B > 135);
        bool skin = (R - B > 22 && R > 175 && G > 120);
        bool keepCenterBlue = blue && x2 >= keepBlueL && x2 <= keepBlueR && y <= keepBlueB;
        if (keepCenterBlue || skin) continue;
        erased[idx] = true;
        px[i+3] = 0;
      }

    // 5) 连通域过滤
    bool[] compVisited = new bool[total];
    int[] comp = new int[total];
    qh=0; qt=0;
    for (int sy=0; sy<H; sy++)
      for (int sx=0; sx<W; sx++) {
        int sidx = sy*W+sx;
        if (compVisited[sidx] || erased[sidx] || bg[sidx]) continue;
        compVisited[sidx] = true;
        qh=0; qt=0; q[qt++]=sidx;
        int cnt = 0;
        while (qh < qt) {
          int idx = q[qh++]; cnt++;
          int x = idx % W, y = idx / W;
          for (int d=0; d<4; d++) {
            int nx=x+dx[d], ny=y+dy[d];
            if (nx<0||ny<0||nx>=W||ny>=H) continue;
            int nidx = ny*W+nx;
            if (compVisited[nidx] || erased[nidx] || bg[nidx]) continue;
            compVisited[nidx] = true; q[qt++]=nidx;
          }
        }
        if (cnt < 3500) {
          // 再次标记该组件（compVisited 已标记，但我们需要把它擦除）
          for (int i2=0; i2<total; i2++) {} // O(N) 每组件太慢——改为在 BFS 中记录
        }
      }
    // 上面的擦除逻辑需要组件成员列表：重做一遍，用 comp 数组记录
    compVisited = new bool[total];
    for (int sy=0; sy<H; sy++)
      for (int sx=0; sx<W; sx++) {
        int sidx = sy*W+sx;
        if (compVisited[sidx] || erased[sidx] || bg[sidx]) continue;
        compVisited[sidx] = true;
        qh=0; qt=0; q[qt++]=sidx;
        int cnt = 0;
        // 记录成员到 comp（去重由 compVisited 保证）
        int cHead = qh; // 成员从 q[qh..qt)
        while (qh < qt) {
          int idx = q[qh++]; comp[qh-1] = idx; cnt++;
          int x = idx % W, y = idx / W;
          for (int d=0; d<4; d++) {
            int nx=x+dx[d], ny=y+dy[d];
            if (nx<0||ny<0||nx>=W||ny>=H) continue;
            int nidx = ny*W+nx;
            if (compVisited[nidx] || erased[nidx] || bg[nidx]) continue;
            compVisited[nidx] = true; q[qt++]=nidx;
          }
        }
        if (cnt < 3500)
          for (int k=cHead; k<qt; k++) { int idx = comp[k]; px[idx/W*stride + (idx%W)*4 + 3] = 0; }
      }

    // 6) 暗边去污染（2轮）
    for (int iter=0; iter<2; iter++) {
      for (int y=1; y<H-1; y++)
        for (int x3=1; x3<W-1; x3++) {
          int aOff = y*stride+x3*4+3;
          if (px[aOff] == 0) continue;
          int i = y*stride+x3*4;
          int mx = Math.Max(Math.Max(px[i+2],px[i+1]),px[i]);
          if (mx > 95) continue;
          bool nearTrans = px[y*stride+(x3-1)*4+3]==0 || px[y*stride+(x3+1)*4+3]==0 ||
                           px[(y-1)*stride+x3*4+3]==0 || px[(y+1)*stride+x3*4+3]==0;
          if (nearTrans) px[aOff] = 0;
        }
    }

    // 7) 1px 羽化
    byte[] alpha = new byte[total];
    for (int i=0; i<total; i++) alpha[i] = px[i*4+3];
    for (int y=1; y<H-1; y++)
      for (int x3=1; x3<W-1; x3++) {
        int i = y*W+x3;
        if (alpha[i] == 255) {
          int sum = alpha[i-1]+alpha[i+1]+alpha[i-W]+alpha[i+W];
          if (sum < 1020) {
            int na = (255 + sum/4) / 2;
            px[y*stride+x3*4+3] = (byte)Math.Max(140, na);
          }
        }
      }

    // 8) 裁剪
    int bbL=W, bbR=0, bbT=H, bbB=0;
    for (int y=0; y<H; y++)
      for (int x3=0; x3<W; x3++)
        if (px[y*stride+x3*4+3] > 8) {
          if (x3<bbL) bbL=x3; if (x3>bbR) bbR=x3;
          if (y<bbT) bbT=y; if (y>bbB) bbB=y;
        }
    int ow = bbR-bbL+1, oh = bbB-bbT+1;
    Bitmap outBmp = new Bitmap(ow, oh, PixelFormat.Format32bppArgb);
    BitmapData obd = outBmp.LockBits(new Rectangle(0,0,ow,oh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
    for (int y=0; y<oh; y++) {
      System.Runtime.InteropServices.Marshal.Copy(px, (y+bbT)*stride + bbL*4, new IntPtr(obd.Scan0.ToInt64() + y*obd.Stride), ow*4);
    }
    outBmp.UnlockBits(obd);
    outBmp.Save(outPath, ImageFormat.Png);
    outBmp.Dispose();

    long opaque = 0;
    for (int y=0; y<oh; y++)
      for (int x3=0; x3<ow; x3++)
        if (px[(y+bbT)*stride + (x3+bbL)*4 + 3] > 200) opaque++;
    string boxesStr = "";
    for (int b=0; b<boxCount; b++)
      boxesStr += "(" + boxFlat[b*4] + "," + boxFlat[b*4+1] + "," + boxFlat[b*4+2] + "," + boxFlat[b*4+3] + ")";
    return "out=" + ow + "x" + oh
      + " bbox=[" + bbL + "," + bbT + "," + bbR + "," + bbB + "]"
      + " opaquePct=" + (100.0*opaque/((long)ow*oh)).ToString("F1")
      + " cardRect=[" + cMinX + "," + cMinY + "," + cMaxX + "," + cMaxY + "]"
      + " handBoxes=" + boxesStr;
  }

  static void TrySeed(byte[] px, int stride, int x, int y, bool[] bg, int W, int[] q, ref int qt) {
    int i = y*stride+x*4;
    if (px[i+2] < 62 && px[i+1] < 62 && px[i] < 80 && Math.Abs(px[i] - px[i+2]) < 30) {
      int idx = y*W+x;
      if (!bg[idx]) { bg[idx] = true; q[qt++]=idx; }
    }
  }

  static int GapWidth(int[] xhist, int from) {
    int g = 0; int x = from;
    while (x < xhist.Length && xhist[x] == 0) { g++; x++; }
    return g;
  }
}