plugins {
    id("java")
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.aievaluator"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("com.google.code.gson:gson:2.10.1")
    testImplementation("junit:junit:4.13.2")
}

intellij {
    version.set("2024.1")
    type.set("IC") // IntelliJ IDEA Community Edition
    plugins.set(listOf())
}

tasks {
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("242.*")
    }

    signPlugin {
        certificateChain.set(System.getenv("CERTIFICATE_CHAIN"))
        privateKey.set(System.getenv("PRIVATE_KEY"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD"))
    }

    publishPlugin {
        token.set(System.getenv("PUBLISH_TOKEN"))
    }
}
