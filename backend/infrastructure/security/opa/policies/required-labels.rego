package muni.kubernetes.required_labels

import future.keywords.if
import future.keywords.in

# Required labels for all workloads in the muni namespace
required_labels := {
  "app",
  "tier",
  "version",
}

# Deny if any required label is missing
violation[{"msg": msg}] if {
  input.review.object.metadata.namespace == "muni"
  input.review.object.kind in {"Deployment", "StatefulSet", "DaemonSet"}
  some label in required_labels
  not input.review.object.metadata.labels[label]
  msg := sprintf("Workload '%v' in namespace 'muni' is missing required label: '%v'",
    [input.review.object.metadata.name, label])
}
