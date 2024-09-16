[![codemp](https://code.mp/static/banner.png)](https://code.mp)
[![Actions Status](https://github.com/hexedtech/codemp-vscode/actions/workflows/test.yml/badge.svg)](https://github.com/hexedtech/codemp/actions)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/hexedtech.codemp)](https://marketplace.visualstudio.com/items?itemName=hexedtech.codemp)
[![Visual Studio Marketplace Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/hexedtech.codemp)](https://marketplace.visualstudio.com/items?itemName=hexedtech.codemp)
[![Gitter](https://img.shields.io/gitter/room/hexedtech/codemp)](https://gitter.im/hexedtech/codemp)

> `codemp` is a **collaborative** text editing solution to work remotely.

It seamlessly integrates in your editor providing remote cursors and instant text synchronization,
as well as a remote virtual workspace for you and your team.

# codemp-vscode

This is the reference codemp [vscode](https://code.visualstudio.com/) plugin maintained by [hexedtech](https://hexed.technology)

# installation
**Install from [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=hexedtech.codemp): `ext install hexedtech.codemp`**

Automatically built artifacts are available for download (to logged-in GitHub users) under [our Workflows page](https://github.com/hexedtech/codemp-vscode/actions/workflows/publish.yml).

> [!IMPORTANT]
> Remember to configure your credentials after installing!

To connect to the main `code.mp` server, you [will need an account](https://code.mp/signup).

# usage
To use `codemp`, you should first join a workspace. From inside, it's possible to share local files or fetch remote files, always keeping them in sync.

> [!TIP]
> Your current workspace directory is used as root for `codemp` files, which are relative paths.

Most actions can be performed from the `codemp` sidebar with contextual buttons.

## commands

| command | description |
| --- | --- |
| `codemp.connect ` |  connect to remote codemp server using configured credentials |

once connected, more commands become available:

| command | description |
| --- | --- |
| `codemp.join <workspace>` |  will join requested workspace; starts processing cursors and users |
| `codemp.createWorkspace <workspace>` |  will create a new workspace with given name |
| `codemp.listWorkspaces` |  list all workspaces available to join |
| `codemp.activeWorkspaces` |  list all workspaces currently active |
| `codemp.leaveWorkspace <workspace>` |  leave a currently active workspace |
| `codemp.inviteToWorkspace <user> <workspace>` |  invite a remote user to a workspace you own |

after a workspace is joined, more commands become available:

| command | description |
| --- | --- |
| `codemp.attach <buffer>` |  will fetch remote buffer and keep it in sync |
| `codemp.share` |  will share current buffer and keep it in sync |
| `codemp.createBuffer <bufname>` |  will create a new empty buffer in workspace |
| `codemp.listBuffers` |  will list all available buffers in workspace |
| `codemp.sync` |  forces resynchronization of current buffer |

some commands for the Tree View are also provided:

| command | description |
| --- | --- |
| `codemp.refresh` |  redraws tree view |
| `codemp.focus` |  focuses tree view |

