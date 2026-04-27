#!/usr/bin/env python3
"""栖云文件上传服务
- /upload  — 小红书MCP文件中转（图片/视频）
- /bridge  — 沙箱→栖云通用文件通道（任意格式，需 token）
"""
import os, json, time, hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler

# XHS 上传配置
UPLOAD_DIR = "/opt/xhs-mcp/uploads"
MAX_SIZE = 100 * 1024 * 1024
EXTS = ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic','.mp4','.mov','.avi','.mkv','.flv','.wmv','.webm']
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Bridge 通用上传配置
BRIDGE_DIR = "/opt/qiyun-uploads"
BRIDGE_TOKEN = os.environ.get("BRIDGE_UPLOAD_TOKEN", "")
os.makedirs(BRIDGE_DIR, exist_ok=True)

def _parse_multipart(headers, rfile):
    """解析 multipart/form-data，返回 (filename, filedata) 或 (None, None)"""
    ct = headers.get('Content-Type', '')
    if 'multipart/form-data' not in ct:
        return None, None
    bd = ct.split('boundary=')[-1].encode()
    cl = int(headers.get('Content-Length', 0))
    if cl > MAX_SIZE:
        return None, None
    body = rfile.read(cl)
    for part in body.split(b'--' + bd):
        if b'filename="' not in part:
            continue
        he = part.find(b'\r\n\r\n')
        if he == -1:
            continue
        hdr = part[:he].decode('utf-8', errors='replace')
        fd = part[he+4:]
        if fd.endswith(b'\r\n'):
            fd = fd[:-2]
        fs = hdr.find('filename="') + 10
        fe = hdr.find('"', fs)
        on = hdr[fs:fe]
        return on, fd
    return None, None

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self._j(200, {"status": "ok"})
        elif self.path == '/list':
            files = [{"name":f,"path":os.path.join(UPLOAD_DIR,f),"size":os.path.getsize(os.path.join(UPLOAD_DIR,f))} for f in sorted(os.listdir(UPLOAD_DIR)) if os.path.isfile(os.path.join(UPLOAD_DIR,f))]
            self._j(200, {"files": files, "count": len(files)})
        elif self.path == '/bridge/list':
            if not self._check_token():
                return
            files = []
            for f in sorted(os.listdir(BRIDGE_DIR)):
                fp = os.path.join(BRIDGE_DIR, f)
                if os.path.isfile(fp):
                    files.append({"name": f, "size": os.path.getsize(fp)})
            self._j(200, {"files": files, "count": len(files)})
        else:
            html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>栖云文件上传</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f5f5;padding:20px}.c{max-width:500px;margin:0 auto}h1{font-size:20px;color:#333;margin-bottom:20px;text-align:center}.u{background:#fff;border:2px dashed #ccc;border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer}.u:hover{border-color:#4a90d9;background:#f0f7ff}.u p{color:#666;margin:10px 0}.icon{font-size:48px}input[type=file]{display:none}.btn{display:block;width:100%;padding:14px;margin-top:16px;background:#4a90d9;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer}.btn:disabled{background:#ccc}.r{margin-top:16px;padding:12px;border-radius:8px;font-size:14px;word-break:break-all}.ok{background:#e8f5e9;color:#2e7d32}.er{background:#fce4ec;color:#c62828}.pg{margin-top:12px;height:6px;background:#eee;border-radius:3px;display:none}.pb{height:100%;background:#4a90d9;border-radius:3px;transition:width .3s}.fi{margin-top:12px;font-size:13px;color:#888}</style></head><body><div class="c"><h1>📁 栖云文件上传</h1><div class="u" id="dz" onclick="fi.click()"><div class="icon">📤</div><p>点击选择或拖拽文件</p><p style="font-size:12px;color:#999">支持图片和视频，最大100MB</p></div><input type="file" id="fi" accept="image/*,video/*"><div class="fi" id="fn"></div><div class="pg" id="pg"><div class="pb" id="pb"></div></div><button class="btn" id="ub" disabled onclick="up()">上传</button><div class="r" id="rs" style="display:none"></div></div><script>var dz=document.getElementById("dz"),fi=document.getElementById("fi"),ub=document.getElementById("ub"),rs=document.getElementById("rs"),pg=document.getElementById("pg"),pb=document.getElementById("pb"),fn=document.getElementById("fn"),sf=null;fi.onchange=function(e){sel(e.target.files[0])};dz.ondragover=function(e){e.preventDefault();dz.style.borderColor="#4a90d9"};dz.ondragleave=function(){dz.style.borderColor="#ccc"};dz.ondrop=function(e){e.preventDefault();dz.style.borderColor="#ccc";if(e.dataTransfer.files.length)sel(e.dataTransfer.files[0])};function sel(f){if(!f)return;sf=f;var s=f.size>1048576?(f.size/1048576).toFixed(1)+"MB":(f.size/1024).toFixed(0)+"KB";fn.textContent=f.name+" ("+s+")";ub.disabled=false;rs.style.display="none"}function up(){if(!sf)return;var fd=new FormData();fd.append("file",sf);var x=new XMLHttpRequest();x.open("POST","/upload/upload");pg.style.display="block";ub.disabled=true;x.upload.onprogress=function(e){if(e.lengthComputable)pb.style.width=(e.loaded/e.total*100)+"%"};x.onload=function(){pg.style.display="none";ub.disabled=false;var d=JSON.parse(x.responseText);rs.style.display="block";if(x.status===200){rs.className="r ok";rs.innerHTML="✅ 上传成功<br>路径：<strong>"+d.path+"</strong><br><small>可直接用于MCP发布</small>"}else{rs.className="r er";rs.textContent="❌ "+(d.error||"失败")}};x.onerror=function(){pg.style.display="none";ub.disabled=false;rs.style.display="block";rs.className="r er";rs.textContent="❌ 网络错误"};x.send(fd)}</script></body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html;charset=utf-8')
            self.end_headers()
            self.wfile.write(html.encode())

    def do_POST(self):
        if self.path == '/upload':
            self._handle_xhs_upload()
        elif self.path == '/bridge':
            self._handle_bridge_upload()
        else:
            self._j(404, {"error": "Not found"})

    def _check_token(self):
        """验证 Authorization: Bearer <token>"""
        if not BRIDGE_TOKEN:
            self._j(503, {"error": "Bridge token not configured"})
            return False
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer ') or auth[7:] != BRIDGE_TOKEN:
            self._j(401, {"error": "Unauthorized"})
            return False
        return True

    def _handle_bridge_upload(self):
        """通用文件上传：任意格式，需 token，存到 BRIDGE_DIR"""
        if not self._check_token():
            return
        filename, filedata = _parse_multipart(self.headers, self.rfile)
        if filename is None or filedata is None:
            self._j(400, {"error": "需要 multipart/form-data 且包含 file 字段"})
            return
        # 清洗文件名：只保留字母数字点下划线短横线
        import re
        _, ext = os.path.splitext(filename)
        safe_name = re.sub(r'[^A-Za-z0-9._-]', '_', filename)
        ts = time.strftime('%Y%m%d_%H%M%S')
        final_name = f"{ts}_{safe_name}"
        fp = os.path.join(BRIDGE_DIR, final_name)
        with open(fp, 'wb') as f:
            f.write(filedata)
        sha = hashlib.sha256(filedata).hexdigest()
        self._j(200, {
            "success": True,
            "name": final_name,
            "path": fp,
            "size": len(filedata),
            "sha256": sha,
        })

    def _handle_xhs_upload(self):
        """小红书MCP上传：仅图片/视频"""
        filename, filedata = _parse_multipart(self.headers, self.rfile)
        if filename is None or filedata is None:
            self._j(400, {"error": "需要 multipart/form-data"})
            return
        _, ext = os.path.splitext(filename.lower())
        if ext not in EXTS:
            self._j(400, {"error": f"不支持: {ext}"})
            return
        ts = time.strftime('%Y%m%d_%H%M%S')
        fn = f"{ts}_{filename.replace(' ','_').replace('/','_')}"
        fp = os.path.join(UPLOAD_DIR, fn)
        with open(fp, 'wb') as f:
            f.write(filedata)
        vexts = ['.mp4','.mov','.avi','.mkv','.flv','.wmv','.webm']
        self._j(200, {"success": True, "path": fp, "name": fn, "size": len(filedata), "type": "video" if ext in vexts else "image"})

    def _j(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json;charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def log_message(self, fmt, *a):
        print(f"[upload] {fmt%a}")

if __name__ == '__main__':
    if not BRIDGE_TOKEN:
        print("⚠️  BRIDGE_UPLOAD_TOKEN 未设置，/bridge 端点不可用")
    else:
        print(f"✓ Bridge 上传已启用，目录: {BRIDGE_DIR}")
    s = HTTPServer(('0.0.0.0', 18070), H)
    print(f"文件上传服务启动: http://0.0.0.0:18070")
    s.serve_forever()
