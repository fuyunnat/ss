package api

import "net/http"

type settingsResponse struct {
	HTTPAddr             string `json:"httpAddr"`
	CORSAllowOrigin      string `json:"corsAllowOrigin"`
	DataDir              string `json:"dataDir"`
	FrontendEnabled      bool   `json:"frontendEnabled"`
	AdminUsername        string `json:"adminUsername"`
	DefaultAdminPassword bool   `json:"defaultAdminPassword"`
	AgentTokenConfigured bool   `json:"agentTokenConfigured"`
	AIConfigured         bool   `json:"aiConfigured"`
	AIBaseURL            string `json:"aiBaseUrl"`
	AIAPIKeyConfigured   bool   `json:"aiApiKeyConfigured"`
	AIModel              string `json:"aiModel"`
	SessionSecretCustom  bool   `json:"sessionSecretCustom"`
	MasterConfigCommand  string `json:"masterConfigCommand"`
	AgentConfigCommand   string `json:"agentConfigCommand"`
	MasterServiceName    string `json:"masterServiceName"`
	AgentServiceName     string `json:"agentServiceName"`
}

func (r *Router) handleSettings(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	writeJSON(w, http.StatusOK, settingsResponse{
		HTTPAddr:             r.httpAddr,
		CORSAllowOrigin:      r.corsOrigin,
		DataDir:              r.dataDir,
		FrontendEnabled:      r.frontendDir != "",
		AdminUsername:        r.adminUsername,
		DefaultAdminPassword: r.adminUsername == "admin" && r.adminPassword == "admin",
		AgentTokenConfigured: r.agentToken != "",
		AIConfigured:         r.aiBaseURL != "" && r.aiAPIKey != "",
		AIBaseURL:            r.aiBaseURL,
		AIAPIKeyConfigured:   r.aiAPIKey != "",
		SessionSecretCustom:  r.sessionSecret != "" && r.sessionSecret != "proxy-control-session:"+r.adminPassword,
		AIModel:              r.aiModel,
		MasterConfigCommand:  "fyss",
		AgentConfigCommand:   "fyss",
		MasterServiceName:    "proxy-control",
		AgentServiceName:     "proxy-control-agent",
	})
}
