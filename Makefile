BINARY := agentcast
BUILD_DIR := ./bin
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS := -ldflags "-X github.com/adamgold/agentcast/internal/cmd.version=$(VERSION)"

.PHONY: build install test lint clean

build:
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY) ./cmd/cast

install:
	go install $(LDFLAGS) ./cmd/cast

test:
	go test ./...

lint:
	golangci-lint run

clean:
	rm -rf $(BUILD_DIR)
