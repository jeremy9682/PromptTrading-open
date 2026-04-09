SHELL := /bin/bash

.PHONY: help install install-frontend install-backend install-user-management \
        dev dev-frontend dev-backend dev-user-management build preview test

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  install                Install all dependencies (frontend + backend + user-management)"
	@echo "  install-frontend       Install frontend dependencies"
	@echo "  install-backend        Install backend dependencies"
	@echo "  install-user-management Install user-management (Strapi) dependencies"
	@echo ""
	@echo "  dev                    Start frontend dev server (alias for dev-frontend)"
	@echo "  dev-frontend           Start Vite frontend dev server  (port 3001)"
	@echo "  dev-backend            Start Node.js backend server    (port 3002)"
	@echo "  dev-user-management    Start Strapi user-management    (port 1337)"
	@echo ""
	@echo "  build                  Build frontend for production"
	@echo "  preview                Preview frontend production build"
	@echo "  test                   Run backend test suite"

install: install-frontend install-backend install-user-management

install-frontend:
	cd $(CURDIR) && npm install

install-backend:
	cd $(CURDIR)/backend && npm install

install-user-management:
	cd $(CURDIR)/user-management && npm install

dev: dev-frontend

dev-frontend:
	cd $(CURDIR) && npm run dev

dev-backend:
	cd $(CURDIR)/backend && npm run dev

dev-user-management:
	cd $(CURDIR)/user-management && npm run dev

build:
	cd $(CURDIR) && npm run build

preview:
	cd $(CURDIR) && npm run preview

test:
	cd $(CURDIR)/backend && npm test
