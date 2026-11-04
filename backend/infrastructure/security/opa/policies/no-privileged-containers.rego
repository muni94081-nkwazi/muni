package muni.kubernetes.no_privileged

import future.keywords.if

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  container.securityContext.privileged == true
  msg := sprintf("Container '%v' is privileged. Remove securityContext.privileged=true.",
    [container.name])
}

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  container.securityContext.runAsRoot == true
  msg := sprintf("Container '%v' runs as root. Set runAsNonRoot=true.",
    [container.name])
}

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  container.securityContext.allowPrivilegeEscalation == true
  msg := sprintf("Container '%v' allows privilege escalation. Set allowPrivilegeEscalation=false.",
    [container.name])
}

# Require runAsNonRoot
violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  not container.securityContext.runAsNonRoot
  msg := sprintf("Container '%v' does not set runAsNonRoot=true.", [container.name])
}
