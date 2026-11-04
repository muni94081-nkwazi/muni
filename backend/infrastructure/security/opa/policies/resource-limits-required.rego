package muni.kubernetes.resource_limits

import future.keywords.if

# All containers in muni namespace must have resource limits
violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  not container.resources.limits.memory
  msg := sprintf("Container '%v' is missing memory limit. Add resources.limits.memory.",
    [container.name])
}

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  not container.resources.limits.cpu
  msg := sprintf("Container '%v' is missing CPU limit. Add resources.limits.cpu.",
    [container.name])
}

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  not container.resources.requests.memory
  msg := sprintf("Container '%v' is missing memory request.", [container.name])
}
