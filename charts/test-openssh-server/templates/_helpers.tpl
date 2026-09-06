{{- define "test-openssh-server.fullname" -}}
{{- .Release.Name }}-{{ .Chart.Name }}
{{- end -}}

{{- define "test-openssh-server.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}
