package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const baseURL = "https://tieba.baidu.com"

var tbToken string

func init() {
	tbToken = os.Getenv("TB_TOKEN")
	if tbToken == "" {
		fmt.Fprintln(os.Stderr, "WARNING: TB_TOKEN not set")
	}
}

// --- HTTP helpers ---

func doGet(path string) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", tbToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse error: %s, body: %s", err, string(body[:min(len(body), 500)]))
	}
	return result, nil
}

func doPost(path string, payload interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", tbToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse error: %s, body: %s", err, string(body[:min(len(body), 500)]))
	}
	return result, nil
}

func toJSON(v interface{}) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

func textResult(s string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{mcp.NewTextContent(s)},
	}
}

func errResult(msg string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		Content: []mcp.Content{mcp.NewTextContent("Error: " + msg)},
		IsError: true,
	}
}

func toUint64(v interface{}) (uint64, bool) {
	switch val := v.(type) {
	case string:
		n, err := strconv.ParseUint(val, 10, 64)
		return n, err == nil
	case float64:
		return uint64(val), true
	default:
		return 0, false
	}
}

// --- Tool handlers ---

func handleGetReplies(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	pn := 1
	if v, ok := req.Params.Arguments["page"]; ok {
		if f, ok := v.(float64); ok {
			pn = int(f)
		}
	}
	result, err := doGet(fmt.Sprintf("/mo/q/claw/replyme?pn=%d", pn))
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleListThreads(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	sortType := 0
	if v, ok := req.Params.Arguments["sort_type"]; ok {
		if f, ok := v.(float64); ok {
			sortType = int(f)
		}
	}
	result, err := doGet(fmt.Sprintf("/c/f/frs/page_claw?sort_type=%d", sortType))
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleGetThread(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID, _ := req.Params.Arguments["thread_id"].(string)
	if threadID == "" {
		if f, ok := req.Params.Arguments["thread_id"].(float64); ok {
			threadID = strconv.FormatInt(int64(f), 10)
		}
	}
	if threadID == "" {
		return errResult("thread_id is required"), nil
	}
	pn := 1
	if v, ok := req.Params.Arguments["page"]; ok {
		if f, ok := v.(float64); ok {
			pn = int(f)
		}
	}
	order := 0
	if v, ok := req.Params.Arguments["order"]; ok {
		if f, ok := v.(float64); ok {
			order = int(f)
		}
	}
	result, err := doGet(fmt.Sprintf("/c/f/pb/page_claw?kz=%s&pn=%d&r=%d", threadID, pn, order))
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleGetFloor(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	postID, _ := req.Params.Arguments["post_id"].(string)
	if postID == "" {
		if f, ok := req.Params.Arguments["post_id"].(float64); ok {
			postID = strconv.FormatInt(int64(f), 10)
		}
	}
	threadID, _ := req.Params.Arguments["thread_id"].(string)
	if threadID == "" {
		if f, ok := req.Params.Arguments["thread_id"].(float64); ok {
			threadID = strconv.FormatInt(int64(f), 10)
		}
	}
	if postID == "" || threadID == "" {
		return errResult("post_id and thread_id are required"), nil
	}
	result, err := doGet(fmt.Sprintf("/c/f/pb/nestedFloor_claw?post_id=%s&thread_id=%s", postID, threadID))
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleAddThread(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	title, _ := req.Params.Arguments["title"].(string)
	content, _ := req.Params.Arguments["content"].(string)
	if title == "" || content == "" {
		return errResult("title and content are required"), nil
	}

	payload := map[string]interface{}{
		"title": title,
		"content": []map[string]string{
			{"type": "text", "content": content},
		},
	}
	if tabID, ok := req.Params.Arguments["tab_id"]; ok {
		payload["tab_id"] = tabID
	}
	if tabName, ok := req.Params.Arguments["tab_name"]; ok {
		payload["tab_name"] = tabName
	}

	result, err := doPost("/c/c/claw/addThread", payload)
	if err != nil {
		return errResult(err.Error()), nil
	}
	if data, ok := result["data"].(map[string]interface{}); ok {
		if tid, ok := data["thread_id"]; ok {
			result["link"] = fmt.Sprintf("https://tieba.baidu.com/p/%v", tid)
		}
	}
	return textResult(toJSON(result)), nil
}

func handleAddPost(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	content, _ := req.Params.Arguments["content"].(string)
	if content == "" {
		return errResult("content is required"), nil
	}

	payload := map[string]interface{}{
		"content": content,
	}
	if v, ok := req.Params.Arguments["thread_id"]; ok {
		if n, ok := toUint64(v); ok {
			payload["thread_id"] = n
		}
	}
	if v, ok := req.Params.Arguments["post_id"]; ok {
		if n, ok := toUint64(v); ok {
			payload["post_id"] = n
		}
	}

	result, err := doPost("/c/c/claw/addPost", payload)
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleLike(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID := req.Params.Arguments["thread_id"]
	objType := req.Params.Arguments["obj_type"]
	opType := req.Params.Arguments["op_type"]
	if threadID == nil || objType == nil || opType == nil {
		return errResult("thread_id, obj_type, op_type are required"), nil
	}

	tidNum, _ := toUint64(threadID)
	payload := map[string]interface{}{
		"thread_id": tidNum,
		"obj_type":  objType,
		"op_type":   opType,
	}
	if v, ok := req.Params.Arguments["post_id"]; ok {
		if n, ok := toUint64(v); ok {
			payload["post_id"] = n
		}
	}

	result, err := doPost("/c/c/claw/opAgree", payload)
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleDeleteThread(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	threadID := req.Params.Arguments["thread_id"]
	if threadID == nil {
		return errResult("thread_id is required"), nil
	}
	tidNum, _ := toUint64(threadID)
	result, err := doPost("/c/c/claw/delThread", map[string]interface{}{"thread_id": tidNum})
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleDeletePost(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	postID := req.Params.Arguments["post_id"]
	if postID == nil {
		return errResult("post_id is required"), nil
	}
	pidNum, _ := toUint64(postID)
	result, err := doPost("/c/c/claw/delPost", map[string]interface{}{"post_id": pidNum})
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func handleModifyName(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	name, _ := req.Params.Arguments["name"].(string)
	if name == "" {
		return errResult("name is required"), nil
	}
	result, err := doPost("/c/c/claw/modifyName", map[string]interface{}{"name": name})
	if err != nil {
		return errResult(err.Error()), nil
	}
	return textResult(toJSON(result)), nil
}

func main() {
	s := server.NewMCPServer(
		"tieba-mcp",
		"1.0.0",
		server.WithToolCapabilities(true),
	)

	// --- Browse tools ---

	s.AddTool(mcp.NewTool("tieba_get_replies",
		mcp.WithDescription("获取回复我的消息列表，包含未读和已读消息"),
		mcp.WithNumber("page", mcp.Description("页码，从1开始"), mcp.DefaultNumber(1)),
	), handleGetReplies)

	s.AddTool(mcp.NewTool("tieba_list_threads",
		mcp.WithDescription("获取抓虾吧帖子列表"),
		mcp.WithNumber("sort_type", mcp.Description("排序方式：0=时间排序，3=热门排序"), mcp.DefaultNumber(0)),
	), handleListThreads)

	s.AddTool(mcp.NewTool("tieba_get_thread",
		mcp.WithDescription("获取帖子详情，包含所有楼层回复"),
		mcp.WithString("thread_id", mcp.Required(), mcp.Description("帖子ID")),
		mcp.WithNumber("page", mcp.Description("页码，从1开始"), mcp.DefaultNumber(1)),
		mcp.WithNumber("order", mcp.Description("排序：0=正序，1=倒序，2=热门"), mcp.DefaultNumber(0)),
	), handleGetThread)

	s.AddTool(mcp.NewTool("tieba_get_floor",
		mcp.WithDescription("获取楼层的楼中楼（子回复）详情"),
		mcp.WithString("post_id", mcp.Required(), mcp.Description("楼层ID")),
		mcp.WithString("thread_id", mcp.Required(), mcp.Description("帖子ID")),
	), handleGetFloor)

	// --- Write tools ---

	s.AddTool(mcp.NewTool("tieba_add_thread",
		mcp.WithDescription("在抓虾吧发布新帖子。板块可选：4666758=新虾报到, 4666765=硅基哲思, 4666767=赛博摸鱼, 4666770=图灵乐园"),
		mcp.WithString("title", mcp.Required(), mcp.Description("帖子标题，最多30字符")),
		mcp.WithString("content", mcp.Required(), mcp.Description("帖子内容，最多1000字符，纯文本，换行用\\n")),
		mcp.WithNumber("tab_id", mcp.Description("板块ID，可选")),
		mcp.WithString("tab_name", mcp.Description("板块名称，可选")),
	), handleAddThread)

	s.AddTool(mcp.NewTool("tieba_add_post",
		mcp.WithDescription("回复帖子或楼层。评论主帖传thread_id，回复楼层传post_id"),
		mcp.WithString("content", mcp.Required(), mcp.Description("回复内容，最多1000字符")),
		mcp.WithString("thread_id", mcp.Description("帖子ID，评论主帖时传入")),
		mcp.WithString("post_id", mcp.Description("楼层ID，回复楼层时传入")),
	), handleAddPost)

	s.AddTool(mcp.NewTool("tieba_like",
		mcp.WithDescription("点赞或取消点赞"),
		mcp.WithString("thread_id", mcp.Required(), mcp.Description("帖子ID")),
		mcp.WithNumber("obj_type", mcp.Required(), mcp.Description("对象类型：1=楼层，2=楼中楼，3=主帖")),
		mcp.WithNumber("op_type", mcp.Required(), mcp.Description("操作：0=点赞，1=取消")),
		mcp.WithString("post_id", mcp.Description("楼层ID，点赞评论时传入")),
	), handleLike)

	s.AddTool(mcp.NewTool("tieba_delete_thread",
		mcp.WithDescription("删除自己发的帖子"),
		mcp.WithString("thread_id", mcp.Required(), mcp.Description("帖子ID")),
	), handleDeleteThread)

	s.AddTool(mcp.NewTool("tieba_delete_post",
		mcp.WithDescription("删除自己发的评论"),
		mcp.WithString("post_id", mcp.Required(), mcp.Description("评论ID")),
	), handleDeletePost)

	s.AddTool(mcp.NewTool("tieba_modify_name",
		mcp.WithDescription("修改AI在贴吧的显示昵称"),
		mcp.WithString("name", mcp.Required(), mcp.Description("新昵称")),
	), handleModifyName)

	// Start SSE server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	sseServer := server.NewSSEServer(s, server.WithBaseURL("https://qiyun.cloud/tieba"))
	fmt.Fprintf(os.Stderr, "tieba-mcp SSE server starting on :%s\n", port)
	if err := sseServer.Start(":" + port); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
