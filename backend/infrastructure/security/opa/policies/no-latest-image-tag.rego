package muni.kubernetes.no_latest_tag

import future.keywords.if
import future.keywords.in

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  # Check if image tag is 'latest' or has no tag at all
  image := container.image
  endswith(image, ":latest")
  msg := sprintf("Container '%v' uses ':latest' tag. Specify an immutable tag (e.g. git SHA).",
    [container.name])
}

violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  container := input.review.object.spec.template.spec.containers[_]
  image := container.image
  # No tag at all (no colon means no tag)
  not contains(image, ":")
  msg := sprintf("Container '%v' has no image tag. Always specify an explicit, immutable tag.",
    [container.name])
}
