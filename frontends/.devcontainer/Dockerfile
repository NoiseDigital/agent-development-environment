# NOTE: Can't get this to work, been running flutter locally
FROM opensuse/tumbleweed:latest

RUN set -ex && \
	rpm --import https://dl.google.com/linux/linux_signing_key.pub && \
	zypper addrepo http://dl.google.com/linux/chrome/rpm/stable/x86_64 google-chrome && \
	rpm --import https://packages.microsoft.com/keys/microsoft.asc && \
	zypper addrepo https://packages.microsoft.com/yumrepos/vscode vscode && \
	zypper refresh && \
	zypper install --no-confirm \
		binutils \
		clang \
		cmake \
		code \
		gcc \
		git \
		gtk3-devel \
		google-chrome-stable \
		iproute2 \
		java-11-openjdk-devel \
		jq \
		libopenssl-devel \
		libpulse0 \
		libXcomposite1 \
		man \
		man-pages \
		ninja \
		rsync \
		strace \
		system-group-kvm \
		sudo \
		unzip \
		vim \
		wget \
		xauth \
		xeyes \
		xhost \
		xorg-x11-server \
		xorg-x11-util-devel \
		xrdb \
		&& \
	zypper clean

ARG UID=1000
ARG GID=100
RUN set -ex && \
	useradd --uid ${UID} --gid ${GID} --groups kvm --create-home vscode && \
	echo 'vscode ALL=(root) NOPASSWD:ALL' > /etc/sudoers.d/vscode && \
	chmod 0440 /etc/sudoers.d/vscode
USER ${UID}:${GID}
WORKDIR /home/vscode

ENV JAVA_HOME=/usr/lib64/jvm/java-11-openjdk-11

ENV KOTLIN_VERSION=1.7.10
ARG KOTLIN_ARCHIVE=kotlin-compiler-${KOTLIN_VERSION}.zip
ARG KOTLIN_URL=https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/${KOTLIN_ARCHIVE}
ENV KOTLIN_HOME=/home/vscode/kotlinc
ENV PATH=${PATH}:${KOTLIN_HOME}/bin
RUN set -ex && \
	curl -sLO ${KOTLIN_URL} && \
	unzip ${KOTLIN_ARCHIVE} && \
	rm ${KOTLIN_ARCHIVE} && \
	kotlin -version && \
	kotlinc -version

ENV GRADLE_VERSION=7.5.1
ARG GRADLE_DIST=bin
ARG GRADLE_ARCHIVE=gradle-${GRADLE_VERSION}-${GRADLE_DIST}.zip
ARG GRADLE_URL=https://services.gradle.org/distributions/${GRADLE_ARCHIVE}
ENV GRADLE_HOME=/home/vscode/gradle
ENV PATH=${PATH}:${GRADLE_HOME}/bin
RUN set -ex && \
	curl -sLO ${GRADLE_URL} && \
	unzip ${GRADLE_ARCHIVE} && \
	rm ${GRADLE_ARCHIVE} && \
	mv gradle-${GRADLE_VERSION} gradle && \
	gradle --version

ENV ANDROID_SDK_VERSION=9123335
ARG ANDROID_SDK_ARCHIVE=commandlinetools-linux-${ANDROID_SDK_VERSION}_latest.zip
ARG ANDROID_SDK_URL=https://dl.google.com/android/repository/${ANDROID_SDK_ARCHIVE}
ARG ANDROID_SDK_PACKAGES
ENV ANDROID_SDK_ROOT=/home/vscode/android-sdk
ENV PATH=${PATH}:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/cmdline-tools/tools/bin:${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator
RUN set -ex && \
	mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
	curl -sLO ${ANDROID_SDK_URL} && \
	unzip ${ANDROID_SDK_ARCHIVE} -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
	rm ${ANDROID_SDK_ARCHIVE} && \
	mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/tools && \
	sdkmanager --version
# COPY sdkmanager-accept-licenses.sh /usr/local/bin/sdkmanager-accept-licenses
# RUN set -ex && \
# 	sudo chmod 555 /usr/local/bin/sdkmanager-accept-licenses && \
# 	/usr/local/bin/sdkmanager-accept-licenses && \
# 	sdkmanager 'cmdline-tools;latest' 'emulator' 'platform-tools' ${ANDROID_SDK_PACKAGES:-} && \
# 	/usr/local/bin/sdkmanager-accept-licenses
EXPOSE 5037

ENV FLUTTER_VERSION=3.7.10
ARG FLUTTER_DIST=stable
ARG FLUTTER_ARCHIVE=flutter_linux_${FLUTTER_VERSION}-${FLUTTER_DIST}.tar.xz
ARG FLUTTER_URL=https://storage.googleapis.com/flutter_infra_release/releases/${FLUTTER_DIST}/linux/${FLUTTER_ARCHIVE}
ENV FLUTTER_HOME=/home/vscode/flutter
ENV PATH=${PATH}:${FLUTTER_HOME}/bin
RUN set -ex && \
	curl -sLO ${FLUTTER_URL} && \
	tar --extract --owner=${UID} --group=${GID} --file=${FLUTTER_ARCHIVE} && \
	rm  ${FLUTTER_ARCHIVE} && \
	flutter --version && \
	flutter config --no-analytics && \
	flutter config --android-sdk $ANDROID_SDK_ROOT && \
	flutter precache