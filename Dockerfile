# ============================================================
# Stage 1: Android SDK + Java + Node.js (full build environment)
# ============================================================
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0

# Install base tools
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    git \
    openjdk-17-jdk \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Download Android command-line tools
RUN mkdir -p $ANDROID_HOME/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/cmdline-tools.zip && \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools-extracted && \
    mv /tmp/cmdline-tools-extracted/cmdline-tools $ANDROID_HOME/cmdline-tools/latest && \
    rm /tmp/cmdline-tools.zip

# Accept licenses and install SDK packages
RUN yes | sdkmanager --licenses && \
    sdkmanager \
        "platform-tools" \
        "platforms;android-34" \
        "build-tools;34.0.0"

# Set JAVA_HOME
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# ============================================================
# App Setup
# ============================================================
WORKDIR /app

# Copy Android project source
COPY WebToApp /app/WebToApp

# Pre-download Gradle wrapper (so first build doesn't timeout)
RUN chmod +x /app/WebToApp/gradlew && \
    cd /app/WebToApp && \
    ./gradlew --version || true

# Copy builder app
COPY builder/package*.json /app/builder/
RUN cd /app/builder && npm install --production

COPY builder /app/builder

# Create builds output directory
RUN mkdir -p /app/builder/public/builds

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "/app/builder/server.js"]
