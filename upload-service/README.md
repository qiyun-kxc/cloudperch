# 栖云文件上传服务

两个端点：

## /upload — 小红书 MCP 文件中转
- 仅接受图片和视频格式
- 无需鉴权
- 存储到 /opt/xhs-mcp/uploads/

## /bridge — 沙箱→栖云通用文件通道
- 接受任意文件格式
- 需要 Bearer token 鉴权
- 存储到 /opt/qiyun-uploads/
- 返回 filename / size / sha256

### 使用

```bash
curl -fS \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/file" \
  https://qiyun.cloud/upload/bridge
```

### 部署

```bash
# pm2 管理，需设置环境变量
BRIDGE_UPLOAD_TOKEN="your-token" pm2 restart file-upload --update-env
pm2 save
```

### Nginx

```nginx
location /upload/ {
    client_max_body_size 100m;
    proxy_pass http://127.0.0.1:18070/;
}
```

端口: 18070
