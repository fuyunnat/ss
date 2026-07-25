package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const sessionDuration = 24 * time.Hour

type contextKey string

const usernameContextKey contextKey = "username"

type authRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
}

type tokenPayload struct {
	Username  string `json:"username"`
	ExpiresAt int64  `json:"exp"`
}

func (r *Router) handleLogin(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var input authRequest
	if !decodeJSON(w, req, &input) {
		return
	}
	if !constantTimeEqual(input.Username, r.adminUsername) || !constantTimeEqual(input.Password, r.adminPassword) {
		writeError(w, http.StatusUnauthorized, "用户名或密码不正确")
		return
	}

	token, err := r.issueToken(input.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "创建登录会话失败")
		return
	}
	writeJSON(w, http.StatusOK, authResponse{Token: token, Username: input.Username})
}

func (r *Router) handleMe(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	username := usernameFromContext(req.Context())
	if username == "" {
		writeError(w, http.StatusUnauthorized, "登录已失效")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": username})
}

func (r *Router) withAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if isPublicAPI(req.URL.Path) {
			next.ServeHTTP(w, req)
			return
		}

		username, err := r.validateBearer(req.Header.Get("Authorization"))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "请先登录")
			return
		}

		ctx := context.WithValue(req.Context(), usernameContextKey, username)
		next.ServeHTTP(w, req.WithContext(ctx))
	})
}

func isPublicAPI(path string) bool {
	return path == "/api/health" || path == "/api/auth/login" || path == "/api/agent/heartbeat"
}

func (r *Router) issueToken(username string) (string, error) {
	payload := tokenPayload{
		Username:  username,
		ExpiresAt: time.Now().Add(sessionDuration).Unix(),
	}
	rawPayload, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encodedPayload := base64.RawURLEncoding.EncodeToString(rawPayload)
	signature := r.sign(encodedPayload)
	return encodedPayload + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (r *Router) validateBearer(header string) (string, error) {
	if !strings.HasPrefix(header, "Bearer ") {
		return "", errors.New("missing bearer token")
	}
	return r.validateToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
}

func (r *Router) validateToken(token string) (string, error) {
	encodedPayload, encodedSignature, ok := strings.Cut(token, ".")
	if !ok || encodedPayload == "" || encodedSignature == "" {
		return "", errors.New("invalid token format")
	}

	signature, err := base64.RawURLEncoding.DecodeString(encodedSignature)
	if err != nil {
		return "", err
	}
	expected := r.sign(encodedPayload)
	if hmac.Equal(signature, expected) != true {
		return "", errors.New("invalid token signature")
	}

	rawPayload, err := base64.RawURLEncoding.DecodeString(encodedPayload)
	if err != nil {
		return "", err
	}
	var payload tokenPayload
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return "", err
	}
	if payload.Username == "" || payload.ExpiresAt < time.Now().Unix() {
		return "", fmt.Errorf("token expired")
	}
	return payload.Username, nil
}

func (r *Router) sign(payload string) []byte {
	mac := hmac.New(sha256.New, []byte(r.sessionSecret))
	_, _ = mac.Write([]byte(payload))
	return mac.Sum(nil)
}

func constantTimeEqual(left string, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func usernameFromContext(ctx context.Context) string {
	username, _ := ctx.Value(usernameContextKey).(string)
	return username
}
