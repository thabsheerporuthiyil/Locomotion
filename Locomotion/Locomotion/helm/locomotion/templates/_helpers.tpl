{{- define "locomotion.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "locomotion.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "locomotion.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.labels" -}}
app.kubernetes.io/name: {{ include "locomotion.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "locomotion.selectorLabels" -}}
app.kubernetes.io/name: {{ include "locomotion.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "locomotion.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "locomotion.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.fastapiAiServiceAccountName" -}}
{{- if .Values.fastapiAiServiceAccount.create -}}
{{- default (printf "%s-fastapi-ai" (include "locomotion.fullname" .)) .Values.fastapiAiServiceAccount.name -}}
{{- else if .Values.fastapiAiServiceAccount.name -}}
{{- .Values.fastapiAiServiceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.notificationWorkerServiceAccountName" -}}
{{- if .Values.notificationWorker.serviceAccount.create -}}
{{- default (printf "%s-notification-worker" (include "locomotion.fullname" .)) .Values.notificationWorker.serviceAccount.name -}}
{{- else if .Values.notificationWorker.serviceAccount.name -}}
{{- .Values.notificationWorker.serviceAccount.name -}}
{{- else -}}
{{- include "locomotion.serviceAccountName" . -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "locomotion.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.configMapName" -}}
{{- printf "%s-config" (include "locomotion.fullname" .) -}}
{{- end -}}

{{- define "locomotion.firebaseSecretName" -}}
{{- if .Values.notificationWorker.firebase.existingSecretName -}}
{{- .Values.notificationWorker.firebase.existingSecretName -}}
{{- else if .Values.secrets.firebaseServiceAccountJson -}}
{{- printf "%s-firebase-admin" (include "locomotion.fullname" .) -}}
{{- else -}}
{{- required "Provide notificationWorker.firebase.existingSecretName or secrets.firebaseServiceAccountJson for the notification worker." "" -}}
{{- end -}}
{{- end -}}

{{- define "locomotion.backendImage" -}}
{{- printf "%s:%s" .Values.images.backend.repository .Values.images.backend.tag -}}
{{- end -}}

{{- define "locomotion.aiImage" -}}
{{- printf "%s:%s" .Values.images.ai.repository .Values.images.ai.tag -}}
{{- end -}}
