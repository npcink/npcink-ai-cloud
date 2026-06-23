# Cloud Responsibility Boundary v1

Status: retired from local plugin gates.

Magick AI local plugin no longer owns Cloud runtime, Cloud operator console, Cloud anti-drift, or Cloud addon admin UI release gates. Local code keeps only the narrow WordPress-side integration seams that are required to call hosted services.

Cloud implementation and verification now belong in the standalone Cloud repository at `/Users/muze/gitee/magick-ai-cloud`. Local package checks must not recreate Cloud control-plane gates or Cloud admin UI evidence.
